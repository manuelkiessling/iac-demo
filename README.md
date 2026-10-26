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
The [bootstrap procedure](infrastructure/bootstrap/README.md) uses these settings
to provision the project account and its project-specific access. Keep credentials and authentication tokens outside this file.

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

First complete the [two-stage project bootstrap](infrastructure/bootstrap/README.md)
inside `./dev`. It creates the member account, grants project deployment access and
generates the account/backend configuration. Your management-account administrator
session is used for bootstrap; normal deployments use the `iac-demo-deploy` project
permission set via the `iac-demo` AWS CLI profile.

```sh
aws sso login --profile iac-demo --use-device-code --no-browser
export AWS_PROFILE=iac-demo
aws sts get-caller-identity
npm --prefix app run package
cd infrastructure
tofu init -migrate-state -backend-config=backend.generated.hcl
tofu plan -out=demo.tfplan
tofu apply demo.tfplan
tofu output -raw app_url
```

The `./dev` launcher also supports temporary credentials exported through
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN` (or the
`AWS_KEY_ID` / `AWS_SECRET_KEY` aliases). Those credentials must identify the project
account for application deployment. Clear exported credentials when switching to
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
multi-user application. Application state is remote in a private, versioned S3
bucket with native locking. The bootstrap roots keep separate local state files;
back those up securely to manage the account and deployment-access foundation.

```sh
cd infrastructure
tofu destroy  # removes the function, public URL, table (including all Todos), IAM and logs
```

CI builds and tests the application and validates all OpenTofu roots, including
bootstrap guardrail tests with mock providers, without AWS credentials.
It never applies infrastructure. The committed `.terraform.lock.hcl` pins provider versions for CI and local
development.

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
