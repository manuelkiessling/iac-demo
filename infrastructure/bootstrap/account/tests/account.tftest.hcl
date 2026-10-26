mock_provider "aws" {
  mock_data "aws_organizations_organization" {
    defaults = { master_account_id = "071157021432" }
  }
  mock_resource "aws_organizations_account" {
    defaults = { id = "123456789012" }
  }
}

run "project_account_placement" {
  command = plan
  assert {
    condition     = aws_organizations_account.project.parent_id == "ou-9r8p-zeviiafj"
    error_message = "Create the account under the existing Other OU."
  }
  assert {
    condition     = aws_organizations_account.project.email == "kiessling.manuel+aws-iac-demo-root@gmail.com" && aws_organizations_account.project.role_name == "OrganizationAccountAccessRole"
    error_message = "Use the configured account email and initial cross-account role."
  }
}

run "reject_another_organization" {
  command = plan
  override_data {
    target = data.aws_organizations_organization.existing
    values = { master_account_id = "999999999999" }
  }
  expect_failures = [aws_organizations_account.project]
}
