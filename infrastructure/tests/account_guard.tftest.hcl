mock_provider "aws" {
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::071157021432:role/iac-demo-lambda" }
  }
  mock_resource "aws_dynamodb_table" {
    defaults = { arn = "arn:aws:dynamodb:eu-central-1:071157021432:table/iac-demo-todos" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:eu-central-1:071157021432:log-group:/aws/lambda/iac-demo" }
  }
}
mock_provider "archive" {}

run "management_demo_needs_no_bootstrap" {
  command = plan

  assert {
    condition     = var.project_account_id == "071157021432" && aws_iam_role.app.permissions_boundary == null
    error_message = "The demo must target the existing account without a bootstrap-managed boundary."
  }
  assert {
    condition     = jsondecode(aws_iam_role_policy.app.policy).Statement[0].Resource == aws_dynamodb_table.todos.arn && jsondecode(aws_iam_role_policy.app.policy).Statement[1].Resource == "${aws_cloudwatch_log_group.app.arn}:*"
    error_message = "Lambda runtime permissions must stay scoped to this app's table and logs."
  }
}

run "application_cannot_target_another_account" {
  command = plan
  variables {
    project_account_id = "123456789012"
  }
  expect_failures = [var.project_account_id]
}
