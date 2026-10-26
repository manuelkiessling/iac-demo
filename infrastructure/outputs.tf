output "app_url" {
  description = "Open this HTTPS URL to use the Todo application."
  value       = aws_lambda_function_url.app.function_url
}
