mock_provider "aws" {
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/iac-demo-lambda" }
  }
}
mock_provider "archive" {}

run "application_cannot_target_management" {
  command = plan
  variables {
    project_account_id = "071157021432"
  }
  expect_failures = [var.project_account_id]
}
