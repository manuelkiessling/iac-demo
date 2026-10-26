# App + infrastructure, together

A small Todo app demonstrating how one commit can change both application behavior
and the AWS resources that make it work.

**Demo fallback branch: `demo/management-account`.** This branch deploys directly
into existing AWS management account `071157021432` using your non-root Identity
Center AdministratorAccess session. It needs no new AWS account, OU changes,
project permission set or state bucket. The isolated member-account setup remains
on `main`; this fallback lets the demo proceed while the account quota is raised.

- `app/`: Angular 22 frontend and NestJS 12 API, written in TypeScript.
- `infrastructure/`: OpenTofu definitions for AWS Lambda, its HTTPS Function URL,
  DynamoDB and narrowly scoped IAM/logging resources.

The Lambda serves the compiled Angular app and `/api/todos` on the same origin.
There is no server to provision, VPC, container build, API Gateway or CDN to wait
for. The tradeoff is that static assets also invoke Lambda, and the first request
can incur a NestJS cold start. Resource creation and IAM propagation take time;
subsequent code updates are usually much faster, rather than literally instant.

```text
Browser → HTTPS Lambda Function URL → NestJS → DynamoDB
                                      └─ Angular static files
```

## Development shell (Docker)

Install Docker Desktop on macOS (Apple Silicon and Intel are supported), clone
this repository, and run:

```sh
./dev
```

This builds a cached image with the pinned Node.js, npm, OpenTofu and AWS CLI v2,
installs locked app dependencies, and opens Bash in `/workspace`. No host Node.js,
npm, OpenTofu or AWS CLI is required. Docker Engine with BuildKit also works on
Linux. First startup downloads the tools; subsequent runs reuse image layers,
packages and providers. Updating the version files or Dockerfile rebuilds the
relevant layers automatically. Dependency installation reruns when the lockfile,
package settings, Node/npm version or CPU architecture changes.

Inside the shell:

```sh
cd app
npm run dev
```

Open http://localhost:3000. Local development uses the same NestJS API with an
in-memory repository; data resets when the process restarts. No AWS account is
needed. Restart `npm run dev` after source changes to rebuild frontend and API.

```sh
npm test         # HTTP-level API tests using the in-memory repository
npm run package  # compile Angular + NestJS, install only runtime deps into artifact/
```

## AWS authentication

Your existing organization-wide Identity Center user `manuel@kiessling.net` has
AdministratorAccess to management account `071157021432`. That session can deploy
this branch's application, subject to any additional account policies. The account
ID and Identity Center details remain recorded in
[`infrastructure/bootstrap/settings.json`](infrastructure/bootstrap/settings.json).
Keep credentials and authentication tokens outside the repository.

If your exported temporary credentials already work inside `./dev`, keep using
them. Otherwise configure a non-root CLI session inside the container:

```sh
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
aws configure sso --profile organization-admin --use-device-code --no-browser
aws sso login --profile organization-admin --use-device-code --no-browser
export AWS_PROFILE=organization-admin
aws sts get-caller-identity
```

Choose the Identity Center Region `eu-central-1`, the management account, and the
permission set granting AdministratorAccess. The SSO start/issuer URL is available
in the Identity Center console. Verify that the returned account matches the saved
management account ID and the ARN is an `assumed-role/AWSReservedSSO_...` session.
Use this administrator session for the fallback deployment. You do not need root
credentials or a new IAM user. Do not run `./bootstrap` on this branch; its retained
member-account configuration is only used by the setup on `main`.


## Deploy to AWS

Check out this branch, then enter the development container. If you are already
inside `./dev`, just switch branches in that shell:

```sh
git fetch origin
git switch --track origin/demo/management-account  # first checkout only
./dev                                           # skip if already inside
```

From `/workspace` inside the authenticated container:

```sh
aws sts get-caller-identity
npm --prefix app run package
cd infrastructure
tofu init -reconfigure
tofu plan -out=demo.tfplan
# Review the plan before applying.
tofu apply demo.tfplan
tofu output -raw app_url
```

Verify the identity reports account `071157021432` and an
`assumed-role/AWSReservedSSO_AdministratorAccess_...` ARN. The AWS provider only
accepts this account. The plan creates the app's Lambda, public Function URL,
DynamoDB table, execution role/policy and log group. It creates no account or
organization resources. The execution role keeps its narrowly scoped Todo-table
and log permissions; it does not inherit your administrator permissions and does
not require a bootstrap-managed permissions boundary.

This branch uses local state at `infrastructure/management-demo.tfstate`, ignored
by Git. Keep that file and its backup to manage and destroy the deployment.
`-reconfigure` switches the cached backend configuration to this branch's local
backend; no S3 backend configuration is needed. These commands assume no existing
application deployment in this checkout. If an app already uses remote state,
continue managing it with that state rather than starting a second deployment.
If you previously generated `infrastructure/project.generated.auto.tfvars.json`
for a member account, move it out of `infrastructure/` before planning here.
The failed account bootstrap's state is separate and can be retained unchanged.

The `./dev` launcher also supports temporary credentials exported through
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN` (or the
`AWS_KEY_ID` / `AWS_SECRET_KEY` aliases). Those credentials must identify management
account `071157021432` for this branch. Clear exported credentials when switching to
an SSO profile so they do not override it. The launcher does not save passed keys
or tokens into the image, repository or persistent AWS configuration.

Open the output URL. To ship a change, rebuild with `npm run package`, then run
`tofu plan` and `tofu apply`. OpenTofu hashes the ZIP, so an application code change
updates Lambda without replacing the table. The build is deliberately explicit;
OpenTofu doesn't run package managers through `local-exec`.

This is one **public, shared Todo list**, with no authentication. Anyone with the
URL can read and change it. Use sample data. Requests consume billable AWS
resources; DynamoDB uses on-demand billing and logs expire after seven days.
The list uses a paginated table scan: suitable for this small demo, not a large
multi-user application. OpenTofu state is local for this fallback, so keep a secure
backup. Workloads in the management account share that account with your existing
projects; the member-account setup on `main` provides the intended isolation.

```sh
cd infrastructure
tofu destroy  # removes the function, public URL, table (including all Todos), IAM and logs
```

CI builds and tests the application and validates all OpenTofu roots, including
bootstrap guardrail tests with mock providers, without AWS credentials.
It never applies infrastructure. The committed `.terraform.lock.hcl` pins provider versions for CI and local
development.

## Present the feature evolution

Start with this branch's baseline Todo app. To demonstrate the cleanup feature,
create a local presentation branch and merge the current feature branch:

```sh
git switch -c demo/management-account-cleanup
git merge --no-ff origin/feat/completed-todo-cleanup -m "Demo: add Todo cleanup and DynamoDB TTL"
git diff HEAD^ HEAD -- app infrastructure/main.tf
```

The feature changes application code and DynamoDB TTL together. Rebuild the
package and plan/apply using the same local state. Keep following this branch's
deployment instructions and account/backend settings. The original cleanup PR
remains unmerged on GitHub; this merge only changes your local presentation
branch. Keep `management-demo.tfstate` when switching between baseline
and feature commits. Before returning to the member-account setup on `main`,
destroy the fallback deployment from this branch if it is no longer needed;
switching branches alone does not move resources between AWS accounts.

## Files, ports and caches

The checkout is mounted into `/workspace`: edit on the host or inside the shell.
Generated builds and OpenTofu state remain in the checkout. Linux `node_modules`,
the app stack's `.terraform` and the shell home (including AWS credentials) live in separate Docker
volumes scoped to this checkout. They survive `exit` and are not committed. Moving
the checkout changes the default volume namespace; set `DEV_PROJECT=my-demo` for
an explicit stable namespace. Keep the local state files to manage the deployment.
Removing a Docker volume also removes any credentials or caches stored in it.

The local server listens on all container interfaces, with Docker publishing only
on host loopback. Use `DEV_PORT=3001 ./dev` to choose another host port, then open
http://localhost:3001. Commands can also be run directly, without opening a shell:

```sh
./dev npm --prefix app test
./dev tofu -chdir=infrastructure validate
```

`./dev --help` lists options. For a corporate TLS proxy, set
`DEV_CA_CERT=/absolute/path/to/ca.pem`; the certificate is mounted during builds
and runs, rather than stored in the image. No Docker socket is mounted into the
shell. Tools run under your UID/GID so Linux bind mounts do not produce root-owned
files.

If you prefer working without Docker, install Node.js 24.22.1, npm 12.2.1,
OpenTofu 1.13.2 and AWS CLI 2.38.5 yourself, then run `npm ci` in `app/`.

## Toolchain versions

Use the latest stable releases compatible with the deployed runtime and frameworks.
Direct npm dependencies are pinned and `package-lock.json` locks the full tree;
`.terraform.lock.hcl` locks providers. `.node-version`, `.opentofu-version`,
`.aws-cli-version` and the npm `packageManager` field also drive `./dev`.
CI runs the same `./dev` envelope, using an explicit checkout action version.

As checked on 2026-10-26: Angular 22.2.3 (CLI/build 22.2.4), NestJS 12.2.0,
TypeScript 6.0.3, Node.js 24.22.1, npm 12.2.1 and OpenTofu 1.13.2. AWS provider 6.70.0 and archive
provider 2.8.1 are current. TypeScript 7 is newer but outside Angular 22's supported
peer range; Node types stay on 24 to match Lambda's Node.js 24 runtime.

To refresh, check npm `latest` tags and peer requirements, update `package.json`,
run `npm install` and rebuild/test/package. For providers, run `tofu init -upgrade`,
then `tofu fmt -check` and `tofu validate`. Commit both lockfiles with any toolchain
or version changes. CI checks changes without deploying AWS resources.
