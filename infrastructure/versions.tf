terraform {
  required_version = ">= 1.13.2, < 2.0.0"
  backend "s3" {}
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.70"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.8"
    }
  }
}
provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.project_account_id]
  default_tags {
    tags = { Project = var.name }
  }
}
