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

Install Node.js 24.15+ (24.x) and npm, then:

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

Install OpenTofu 1.9+ and configure your AWS CLI/SDK credentials, for example through
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
