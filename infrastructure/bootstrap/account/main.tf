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
}

provider "aws" {
  region              = local.settings.identity_center_region
  allowed_account_ids = [local.settings.management_account_id]
  default_tags {
    tags = { Project = local.settings.project_name }
  }
}

# Read existing organization resources; the project does not own them.
data "aws_organizations_organization" "existing" {
  return_organization_only = true
}

resource "aws_organizations_account" "project" {
  name              = local.settings.project_name
  email             = local.settings.project_account_email
  parent_id         = local.settings.parent_ou_id
  role_name         = "OrganizationAccountAccessRole"
  close_on_deletion = false

  timeouts {
    create = "30m"
  }

  lifecycle {
    prevent_destroy = true
    precondition {
      condition     = data.aws_organizations_organization.existing.master_account_id == local.settings.management_account_id
      error_message = "Run account bootstrap from the configured Organizations management account."
    }
  }
}

output "project_account_id" {
  value = aws_organizations_account.project.id
}
