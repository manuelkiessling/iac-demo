terraform {
  required_version = ">= 1.13.2, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.70"
    }
  }
}

locals {
  settings = jsondecode(file("${path.module}/../settings.json"))
  project  = local.settings.project_name
  role_arn = "arn:aws:iam::${var.project_account_id}:role/${local.project}-lambda"
}

variable "project_account_id" {
  description = "New member account, read from account bootstrap outputs by ./bootstrap."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.project_account_id)) && var.project_account_id != jsondecode(file("${path.module}/../settings.json")).management_account_id
    error_message = "Use the new 12-digit project account ID, not the management account."
  }
}

provider "aws" {
  region              = local.settings.identity_center_region
  allowed_account_ids = [var.project_account_id]
  assume_role {
    role_arn     = "arn:aws:iam::${var.project_account_id}:role/OrganizationAccountAccessRole"
    session_name = "iac-demo-bootstrap"
  }
  default_tags {
    tags = { Project = local.project }
  }
}

provider "aws" {
  alias               = "management"
  region              = local.settings.identity_center_region
  allowed_account_ids = [local.settings.management_account_id]
}

data "aws_identitystore_user" "operator" {
  provider          = aws.management
  identity_store_id = local.settings.identity_store_id
  alternate_identifier {
    unique_attribute {
      attribute_path  = "UserName"
      attribute_value = local.settings.identity_center_user_name
    }
  }
}

resource "aws_s3_bucket" "state" {
  bucket        = "${local.project}-${var.project_account_id}-tofu-state"
  force_destroy = false
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "RequireTLS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# The application still declares its own role policy. This boundary prevents a
# deployer who edits that policy from granting the runtime unrelated privileges.
resource "aws_iam_policy" "runtime_boundary" {
  name = "${local.project}-runtime-boundary"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Scan", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"]
        Resource = "arn:aws:dynamodb:*:${var.project_account_id}:table/${local.project}-todos"
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:${var.project_account_id}:log-group:/aws/lambda/${local.project}:*"
      }
    ]
  })
}

resource "aws_iam_policy" "deploy" {
  name = "${local.project}-deploy"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ProjectFunction"
        Effect   = "Allow"
        Action   = ["lambda:*"]
        Resource = ["arn:aws:lambda:*:${var.project_account_id}:function:${local.project}", "arn:aws:lambda:*:${var.project_account_id}:function:${local.project}:*"]
      },
      {
        Sid      = "ProjectTable"
        Effect   = "Allow"
        Action   = ["dynamodb:*"]
        Resource = ["arn:aws:dynamodb:*:${var.project_account_id}:table/${local.project}-todos", "arn:aws:dynamodb:*:${var.project_account_id}:table/${local.project}-todos/*"]
      },
      {
        Sid      = "ProjectLogs"
        Effect   = "Allow"
        Action   = ["logs:*"]
        Resource = ["arn:aws:logs:*:${var.project_account_id}:log-group:/aws/lambda/${local.project}", "arn:aws:logs:*:${var.project_account_id}:log-group:/aws/lambda/${local.project}:*"]
      },
      {
        Sid      = "DiscoverLogGroup"
        Effect   = "Allow"
        Action   = ["logs:DescribeLogGroups"]
        Resource = "*"
      },
      {
        Sid      = "CreateBoundedRuntimeRole"
        Effect   = "Allow"
        Action   = ["iam:CreateRole", "iam:PutRolePermissionsBoundary"]
        Resource = local.role_arn
        Condition = {
          StringEquals = { "iam:PermissionsBoundary" = aws_iam_policy.runtime_boundary.arn }
        }
      },
      {
        Sid      = "ManageRuntimeRole"
        Effect   = "Allow"
        Action   = ["iam:GetRole", "iam:DeleteRole", "iam:UpdateRole", "iam:UpdateRoleDescription", "iam:UpdateAssumeRolePolicy", "iam:ListRolePolicies", "iam:GetRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole", "iam:TagRole", "iam:UntagRole", "iam:ListRoleTags"]
        Resource = local.role_arn
      },
      {
        Sid       = "PassRuntimeRoleToLambda"
        Effect    = "Allow"
        Action    = ["iam:PassRole"]
        Resource  = local.role_arn
        Condition = { StringEquals = { "iam:PassedToService" = "lambda.amazonaws.com" } }
      },
      {
        Sid      = "ReadRuntimeBoundary"
        Effect   = "Allow"
        Action   = ["iam:GetPolicy", "iam:GetPolicyVersion"]
        Resource = aws_iam_policy.runtime_boundary.arn
      },
      {
        Sid      = "FindApplicationState"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.state.arn
      },
      {
        Sid      = "ApplicationStateAndLock"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.state.arn}/${local.project}/app/*"
      }
    ]
  })
}

resource "aws_ssoadmin_permission_set" "deploy" {
  provider         = aws.management
  instance_arn     = local.settings.identity_center_instance_arn
  name             = "${local.project}-deploy"
  description      = "Deploy the ${local.project} application in its dedicated account."
  session_duration = "PT1H"
}

resource "aws_ssoadmin_customer_managed_policy_attachment" "deploy" {
  provider           = aws.management
  instance_arn       = local.settings.identity_center_instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.deploy.arn
  customer_managed_policy_reference {
    name = aws_iam_policy.deploy.name
    path = "/"
  }
}

resource "aws_ssoadmin_account_assignment" "operator" {
  provider           = aws.management
  instance_arn       = local.settings.identity_center_instance_arn
  permission_set_arn = aws_ssoadmin_permission_set.deploy.arn
  principal_id       = data.aws_identitystore_user.operator.user_id
  principal_type     = "USER"
  target_id          = var.project_account_id
  target_type        = "AWS_ACCOUNT"
  depends_on         = [aws_ssoadmin_customer_managed_policy_attachment.deploy]
}

output "application_configuration" {
  value = {
    variables = { project_account_id = var.project_account_id }
    backend = {
      bucket               = aws_s3_bucket.state.bucket
      key                  = "${local.project}/app/terraform.tfstate"
      workspace_key_prefix = "${local.project}/app/workspaces"
      region               = local.settings.identity_center_region
      encrypt              = true
      use_lockfile         = true
    }
    permission_set = aws_ssoadmin_permission_set.deploy.name
  }
}
