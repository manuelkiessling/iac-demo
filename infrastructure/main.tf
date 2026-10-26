resource "aws_dynamodb_table" "todos" {
  name         = "${var.name}-todos"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"
  attribute {
    name = "id"
    type = "S"
  }
}
resource "aws_iam_role" "app" {
  name = "${var.name}-lambda"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}
resource "aws_cloudwatch_log_group" "app" {
  name              = "/aws/lambda/${var.name}"
  retention_in_days = 7
}
resource "aws_iam_role_policy" "app" {
  name = "todo-storage-and-logs"
  role = aws_iam_role.app.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Scan", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"]
        Resource = aws_dynamodb_table.todos.arn
      },
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.app.arn}:*"
      }
    ]
  })
}
data "archive_file" "app" {
  type        = "zip"
  source_dir  = "${path.module}/../app/artifact"
  output_path = "${path.module}/app.zip"
}
resource "aws_lambda_function" "app" {
  function_name    = var.name
  role             = aws_iam_role.app.arn
  runtime          = "nodejs24.x"
  handler          = "server/lambda.handler"
  filename         = data.archive_file.app.output_path
  source_code_hash = data.archive_file.app.output_base64sha256
  memory_size      = 512
  timeout          = 15
  architectures    = ["arm64"]
  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.todos.name
    }
  }
  depends_on = [aws_iam_role_policy.app, aws_cloudwatch_log_group.app]
}
resource "aws_lambda_function_url" "app" {
  function_name      = aws_lambda_function.app.function_name
  authorization_type = "NONE"
}
# Public Function URLs require both permissions for newly created functions.
resource "aws_lambda_permission" "url" {
  statement_id           = "PublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.app.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}
resource "aws_lambda_permission" "invoke" {
  statement_id             = "PublicFunctionUrlInvoke"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.app.function_name
  principal                = "*"
  invoked_via_function_url = true
}
