mock_provider "aws" {
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws:iam::123456789012:policy/mock" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = {
      id  = "iac-demo-123456789012-tofu-state"
      arn = "arn:aws:s3:::iac-demo-123456789012-tofu-state"
    }
  }
}
mock_provider "aws" {
  alias = "management"
  mock_data "aws_identitystore_user" {
    defaults = { user_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }
  }
  mock_resource "aws_ssoadmin_permission_set" {
    defaults = { arn = "arn:aws:sso:::permissionSet/ssoins-69873e682bff5ad1/ps-0123456789abcdef" }
  }
}
variables {
  project_account_id = "123456789012"
}

run "scoped_deployment_access" {
  command = plan
  assert {
    condition     = aws_ssoadmin_account_assignment.operator.target_id == var.project_account_id && aws_ssoadmin_account_assignment.operator.principal_id == "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    error_message = "Grant the existing human identity access only to the project account."
  }
  assert {
    condition     = aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled" && aws_s3_bucket_public_access_block.state.block_public_policy
    error_message = "Keep versioned state private."
  }
  assert {
    condition     = output.application_configuration.backend.use_lockfile && output.application_configuration.backend.key == "iac-demo/app/terraform.tfstate"
    error_message = "Use S3-native locking and a separate application state key."
  }
  assert {
    condition = alltrue([
      for statement in jsondecode(aws_iam_policy.deploy.policy).Statement :
      statement.Resource == local.role_arn && statement.Condition.StringEquals["iam:PermissionsBoundary"] == aws_iam_policy.runtime_boundary.arn
      if statement.Sid == "CreateBoundedRuntimeRole"
    ])
    error_message = "Creating a runtime role must require its fixed permissions boundary."
  }
  assert {
    condition = !contains(flatten([
      for statement in jsondecode(aws_iam_policy.deploy.policy).Statement : statement.Action
    ]), "iam:DeleteRolePermissionsBoundary")
    error_message = "Deployment access must not remove the runtime boundary."
  }
  assert {
    condition = alltrue([
      for statement in jsondecode(aws_iam_policy.deploy.policy).Statement :
      statement.Resource == "arn:aws:s3:::iac-demo-123456789012-tofu-state/iac-demo/app/*"
      if statement.Sid == "ApplicationStateAndLock"
    ])
    error_message = "Deployment access must only write application state objects."
  }
}

run "reject_management_account_as_project" {
  command = plan
  variables {
    project_account_id = "071157021432"
  }
  expect_failures = [var.project_account_id]
}
