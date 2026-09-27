# Base image optimized for AWS Lambda Python runtime
FROM public.ecr.aws/lambda/python:3.11

# Copy project requirements file
COPY requirements.txt ${LAMBDA_TASK_ROOT}

# Install dependencies (minimized for fast cold starts)
RUN pip install --no-cache-dir -r requirements.txt

# Copy all application source code into execution root
COPY Backend/ ${LAMBDA_TASK_ROOT}/Backend/

# Set Python path to include task root
ENV PYTHONPATH="${LAMBDA_TASK_ROOT}"

# Set the Lambda handler to point to FastAPI Mangum adapter in Backend.main
CMD [ "Backend.main.handler" ]
