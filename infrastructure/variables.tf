variable "aws_region" {
  description = "AWS region for this demo."
  type        = string
  default     = "eu-central-1"
}
variable "name" {
  description = "Unique resource prefix within the AWS account and region."
  type        = string
  default     = "iac-demo"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,39}$", var.name))
    error_message = "Use 3–40 lowercase letters, digits or hyphens, starting with a letter."
  }
}

variable "project_account_id" {
  description = "Existing management account used by this demo fallback branch."
  type        = string
  default     = "071157021432"
  validation {
    condition     = var.project_account_id == jsondecode(file("${path.module}/bootstrap/settings.json")).management_account_id
    error_message = "This fallback branch only deploys into management account 071157021432. Remove any member-account project.generated.auto.tfvars.json before using it."
  }
}
