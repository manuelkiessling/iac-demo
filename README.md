# App + infrastructure, together

A small Todo app demonstrating how one commit can change both application behavior
and the AWS resources that make it work.

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

## Bootstrap settings

The project's non-secret AWS setup is recorded in
[`infrastructure/bootstrap/settings.json`](infrastructure/bootstrap/settings.json):
the new project account's email, its parent **Other** OU, and the existing
organization instance of IAM Identity Center in Frankfurt (`eu-central-1`).
The existing Identity Center user `manuel@kiessling.net` is your organization-wide
human identity. The project bootstrap will look up and reuse that user; its creation,
password, MFA and organization administration remain outside the project lifecycle.
The bootstrap implementation will use these settings to provision the project
account and its project-specific access. Keep credentials and authentication tokens outside this file.

Your existing user now has administrative access to the management account recorded
in `management_account_id`. Configure its non-root CLI session inside `./dev`:

```sh
aws configure sso --profile organization-admin --use-device-code --no-browser
aws sso login --profile organization-admin --use-device-code --no-browser
aws sts get-caller-identity --profile organization-admin
```

Choose the Identity Center Region `eu-central-1`, the management account, and the
permission set granting AdministratorAccess. The SSO start/issuer URL is available
in the Identity Center console. Verify that the returned account matches the saved
management account ID and the ARN is an `assumed-role/AWSReservedSSO_...` session.
This session is for organization/project bootstrap; application deployment will use
the project member account once provisioned.


## Deploy to AWS

You can pass credentials when starting the shell:

```sh
AWS_KEY_ID=your-access-key-id AWS_SECRET_KEY=your-secret-access-key ./dev
# Inside the container:
aws sts get-caller-identity
```

The launcher maps these aliases to `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`,
which the AWS CLI and OpenTofu read automatically. Standard AWS variable names are
also supported and take precedence if both forms are set. For temporary credentials,
include `AWS_SESSION_TOKEN`. Passed credentials exist in the container's environment;
they are not written to the image, repository or persistent AWS configuration.

Alternatively, start `./dev` and configure AWS inside the container. AWS configuration, SSO cache
and shell home persist in a Docker volume, so a host AWS CLI is unnecessary:

```sh
aws configure sso --profile demo --use-device-code --no-browser
aws sso login --profile demo --use-device-code --no-browser
export AWS_PROFILE=demo
aws sts get-caller-identity
```

Open the printed device-login URL in your host browser. If SSO is unavailable,
`aws configure --profile demo` also works. To reuse an existing host profile
instead, explicitly opt in with `DEV_AWS_DIR="$HOME/.aws" AWS_PROFILE=demo ./dev`.
That directory is mounted read/write so SSO can refresh its cache. Standard AWS
credential/region variables and `TF_VAR_aws_region`/`TF_VAR_name` are passed through
when set. Credentials are never copied into the image or repository.

The identity needs permission to manage the resources declared
in `infrastructure/`, including IAM roles and policies. No credentials go in code.

```sh
cd app
npm ci
npm run package
cd ../infrastructure
# Optional: export AWS_PROFILE=your-profile
# Optional: export TF_VAR_aws_region=eu-west-1
# Optional: export TF_VAR_name=your-unique-demo-name
tofu init
tofu plan -out=demo.tfplan
tofu apply demo.tfplan
tofu output -raw app_url
```

Open the output URL. To ship a change, rebuild with `npm run package`, then run
`tofu plan` and `tofu apply`. OpenTofu hashes the ZIP, so an application code change
updates Lambda without replacing the table. The build is deliberately explicit;
OpenTofu doesn't run package managers through `local-exec`.

This is one **public, shared Todo list**, with no authentication. Anyone with the
URL can read and change it. Use sample data. Requests consume billable AWS
resources; DynamoDB uses on-demand billing and logs expire after seven days.
The list uses a paginated table scan: suitable for this small demo, not a large
multi-user application. State is local and ignored by Git; keep it to manage and
destroy this deployment. Use a remote state backend before collaborating on an
actual shared deployment.

```sh
cd infrastructure
tofu destroy  # removes the function, public URL, table (including all Todos), IAM and logs
```

CI builds and tests the application and validates OpenTofu without AWS credentials.
It never applies infrastructure. The committed `.terraform.lock.hcl` pins provider versions for CI and local
development.

## Files, ports and caches

The checkout is mounted into `/workspace`: edit on the host or inside the shell.
Generated builds and OpenTofu state remain in the checkout. Linux `node_modules`,
`.terraform` and the shell home (including AWS credentials) live in separate Docker
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

## Demo: a feature and its infrastructure in one commit

The first implementation commit is a working CRUD app. The next commit adds
**automatic cleanup of completed Todos** in both folders:

- `app/src/server/todos.ts` writes `expiresAt` (Unix seconds) seven days ahead
  when a task is completed. Reopening removes the attribute; renaming keeps it.
  The Angular UI explains the behavior.
- `infrastructure/main.tf` enables DynamoDB TTL on that exact attribute.
  AWS deletes expired items without a cron job, worker or new service.

For a walkthrough, deploy the first implementation commit, complete a task, then
check out the cleanup commit, rebuild and apply. Show `git show` for that commit:
application behavior and infrastructure support are reviewed and shipped together.
The table is updated in place. TTL activation can take about an hour; deletion is
asynchronous and typically happens within a few days of expiration. The API hides
expired tasks immediately on its next list request; the UI refreshes when opened
or when Refresh is clicked. Existing completed tasks acquire expiry only when
completed again after the feature is deployed.

Writing the attribute alone does not enable physical deletion. Enabling TTL alone
does not schedule any Todo for deletion. The commit needs both halves.
