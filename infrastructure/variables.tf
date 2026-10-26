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
