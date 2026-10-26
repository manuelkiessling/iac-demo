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

## Run locally

Install Node.js 24.22.1 (24.x) and npm 12.2.1, then:

```sh
cd app
npm ci
npm run dev
```

Open http://localhost:3000. Local development uses the same NestJS API with an
in-memory repository; data resets when the process restarts. No AWS account is
needed. Restart `npm run dev` after source changes to rebuild frontend and API.

```sh
npm test         # HTTP-level API tests using the in-memory repository
npm run package  # compile Angular + NestJS, install only runtime deps into artifact/
```

## Deploy to AWS

Install OpenTofu 1.13.2+ and configure your AWS CLI/SDK credentials, for example through
an AWS SSO profile. The identity needs permission to manage the resources declared
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

## Toolchain versions

Use the latest stable releases compatible with the deployed runtime and frameworks.
Direct npm dependencies are pinned and `package-lock.json` locks the full tree;
`.terraform.lock.hcl` locks providers. CI uses explicit action and OpenTofu versions.

As checked on 2026-10-26: Angular 22.2.3 (CLI/build 22.2.4), NestJS 12.2.0,
TypeScript 6.0.3, Node.js 24.22.1, npm 12.2.1 and OpenTofu 1.13.2. AWS provider 6.70.0 and archive
provider 2.8.1 are current. TypeScript 7 is newer but outside Angular 22's supported
peer range; Node types stay on 24 to match Lambda's Node.js 24 runtime.

To refresh, check npm `latest` tags and peer requirements, update `package.json`,
run `npm install` and rebuild/test/package. For providers, run `tofu init -upgrade`,
then `tofu fmt -check` and `tofu validate`. Commit both lockfiles with any toolchain
or version changes. CI checks changes without deploying AWS resources.
