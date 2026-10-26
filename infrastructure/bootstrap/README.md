# Historical member-account bootstrap

The application now deploys directly into existing management account
`071157021432`. Follow the [application deployment instructions](../../README.md#deploy-to-aws)
on both `main` and `feat/completed-todo-cleanup`. No bootstrap is needed.

The `account/`, `access/` and root `./bootstrap` launcher are retained as reference
material for the earlier isolated member-account approach. They are not part of
the current application deployment workflow. The original procedure is available
in [the earlier repository version](https://github.com/manuelkiessling/iac-demo/blob/26f0015914f97dfb9236e74bf17747b8fc1ea792/infrastructure/bootstrap/README.md).
It requires spare AWS Organizations account quota and a different application
backend/account configuration.

[settings.json](settings.json) continues to record the agreed non-secret AWS
account, organization and Identity Center details. Authentication tokens and
credentials remain outside the repository.

If you already attempted the earlier bootstrap, retain its separate local state
files. They do not manage the application's resources or its
`infrastructure/management-demo.tfstate` deployment state.
