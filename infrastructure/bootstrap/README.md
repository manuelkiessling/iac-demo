# Project bootstrap

Run this once to establish the project account, deployment access and application
state storage. Your existing organization, Other OU, Identity Center instance,
personal user and management-account administrator access are reused. Bootstrap
never creates or deletes your personal identity or its organization-wide access.

All agreed non-secret inputs live in [settings.json](settings.json). The launcher
reads the new account ID from OpenTofu state, so it does not need to be copied into
commands. Run the commands below from `/workspace` inside `./dev`.

## 1. Verify your management-account session

```sh
aws sts get-caller-identity
```

The account must be `071157021432` and the ARN must identify an assumed role.
Your current Identity Center AdministratorAccess session works. The helper refuses
root sessions and other accounts. Credentials remain in your environment or AWS
CLI cache; they never become OpenTofu variables or repository settings.

## 2. Create the project account

```sh
./bootstrap account plan
# Review the displayed plan: one new iac-demo account under the Other OU.
./bootstrap account apply
```

This creates an account using the configured Gmail alias and places it under
`ou-9r8p-zeviiafj`. Organizations creates `OrganizationAccountAccessRole` in the
member account. Account creation and initial role propagation can take several
minutes. This one-time setup is slower than subsequent app updates.

## 3. Configure access and state storage

Continue with the same management-account administrator session:

```sh
./bootstrap access plan
# Review the project-account resources and the new project-only SSO assignment.
./bootstrap access apply
```

This stage assumes the initial member-account role and creates:

- A private, TLS-only, encrypted, versioned S3 bucket for application state.
- A project deployment policy covering the named Lambda, DynamoDB table, log group,
  application state objects and Lambda execution role.
- A fixed permissions boundary limiting the execution role to its Todo table and
  logs. The deployment policy requires this boundary when creating the role and
  cannot remove it or modify the boundary policy.
- The `iac-demo-deploy` Identity Center permission set and an assignment of your
  existing user to that permission set in the new project account.

It also writes two non-secret, generated local files:

- `infrastructure/project.generated.auto.tfvars.json`: the project account ID.
- `infrastructure/backend.generated.hcl`: S3 backend location and locking settings.

These are ignored by Git and are reproducible from the access-stage state:

```sh
tofu -chdir=infrastructure/bootstrap/access output -json application_configuration
```

Re-running `./bootstrap access plan` and `./bootstrap access apply` also regenerates
them, including when the plan has no resource changes. After a successful apply,
the saved plan is removed. Each later apply requires a fresh plan.

The permission set grants project deployment access, not organization or account
administration. Some service permissions are broad within the exact named project
resources (for example `lambda:*` on this project's function). Adding other AWS
services or changing resource names may require an administrator to update this
bootstrap policy and its runtime boundary.

## 4. Sign in with project deployment access

If you used exported management-account credentials, clear them **in this shell**
so that they do not override your project SSO profile:

```sh
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
aws configure sso --profile iac-demo --use-device-code --no-browser
aws sso login --profile iac-demo --use-device-code --no-browser
export AWS_PROFILE=iac-demo
aws sts get-caller-identity
```

In the configuration wizard, use your existing Identity Center start/issuer URL
and `eu-central-1` SSO Region. Choose the newly created account and `iac-demo-deploy`
permission set. The returned account ID should now be the project account, and the
role should be `AWSReservedSSO_iac-demo-deploy_...`. Refresh with `aws sso login`
when the session expires. A new `./dev` session also inherits credentials exported
on the host, so clear those on the host when switching permanently to SSO profiles.

## 5. Deploy the application

```sh
npm --prefix app run package
cd infrastructure
tofu init -migrate-state -backend-config=backend.generated.hcl
tofu plan -out=demo.tfplan
tofu apply demo.tfplan
tofu output -raw app_url
```

The generated account variable and provider account allowlist prevent application
deployment in the management account. The app declares the role's inline policy
and attaches the bootstrap-managed permissions boundary. Application state uses
S3-native locking, with no extra locking table. Later sessions can use `tofu init`
after the backend has been configured in that checkout; fresh checkouts need the
generated configuration and `-backend-config=backend.generated.hcl` again.

## State and lifecycle

The two bootstrap roots deliberately have separate **local** state files, retained
in the bind-mounted checkout and ignored by Git. Back up both roots' `terraform.tfstate`
files securely; they are needed to manage this foundation and regenerate settings.
The app's state is stored remotely in S3. Never commit state files or saved plans.

The account and state bucket use `prevent_destroy`; the bucket also refuses forced
emptying. `./bootstrap` accepts only `plan` and `apply`. Ordinary app teardown
(`tofu -chdir=infrastructure destroy`) removes the app, while retaining the account,
state bucket, runtime boundary and deployment access. Decommissioning the entire
foundation is a separate administrator operation.

For later bootstrap updates, switch back to your management-account administrator
session. An existing project account must be imported into the account-stage state
before planning; bootstrap is otherwise intended to create a new account, and AWS
requires the configured email to be unused by any existing account.

## Checks without AWS credentials

CI runs these using mock providers; it never applies a real bootstrap:

```sh
node --test infrastructure/bootstrap/tests/*.test.mjs
for root in infrastructure infrastructure/bootstrap/account infrastructure/bootstrap/access; do
  tofu -chdir="$root" init -backend=false
  tofu -chdir="$root" validate
  tofu -chdir="$root" test
done
```
