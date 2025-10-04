# Docker Deployment Guide

## Local Testing with Docker Desktop

### 1. Build and Run with Docker Compose
```bash
# Build and start the container
docker-compose up --build

# Run in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

### 2. Build and Run with Docker CLI
```bash
# Build the image
docker build -t officialstest-app .

# Run the container
docker run -p 3000:3000 \
  -e OPENAI_API_KEY=your_key \
  -e ANTHROPIC_API_KEY=your_key \
  -e GOOGLE_API_KEY=your_key \
  officialstest-app

# Run with env file
docker run -p 3000:3000 --env-file .env officialstest-app
```

### 3. Test the Application
```bash
# Check if container is running
docker ps

# Test the API endpoint
curl http://localhost:3000
```

---

## Production Deployment for DevOps Team

### AWS EC2 Deployment Instructions

#### Option 1: Docker on EC2

**Prerequisites:**
- EC2 instance with Docker installed
- Security group allowing inbound traffic on port 3000
- Environment variables stored in AWS Secrets Manager or Parameter Store

**Steps:**

1. **SSH into EC2 instance**
   ```bash
   ssh -i your-key.pem ec2-user@your-ec2-ip
   ```

2. **Install Docker (if not already installed)**
   ```bash
   sudo yum update -y
   sudo yum install -y docker
   sudo service docker start
   sudo usermod -a -G docker ec2-user
   ```

3. **Transfer or clone the application**
   ```bash
   git clone your-repo-url
   cd officialstest_current
   ```

4. **Build and run the container**
   ```bash
   docker build -t officialstest-app .
   docker run -d -p 3000:3000 \
     -e OPENAI_API_KEY=your_key \
     -e ANTHROPIC_API_KEY=your_key \
     -e GOOGLE_API_KEY=your_key \
     --restart unless-stopped \
     --name officialstest-app \
     officialstest-app
   ```

5. **Set up as systemd service (optional)**
   Create `/etc/systemd/system/officialstest.service`:
   ```ini
   [Unit]
   Description=Officials Test Application
   Requires=docker.service
   After=docker.service

   [Service]
   Restart=always
   ExecStart=/usr/bin/docker start -a officialstest-app
   ExecStop=/usr/bin/docker stop -t 2 officialstest-app

   [Install]
   WantedBy=multi-user.target
   ```

#### Option 2: Amazon ECS (Recommended for Production)

1. **Push image to Amazon ECR**
   ```bash
   # Authenticate Docker to ECR
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin your-account-id.dkr.ecr.us-east-1.amazonaws.com

   # Tag and push image
   docker tag officialstest-app:latest your-account-id.dkr.ecr.us-east-1.amazonaws.com/officialstest-app:latest
   docker push your-account-id.dkr.ecr.us-east-1.amazonaws.com/officialstest-app:latest
   ```

2. **Create ECS Task Definition** (JSON example)
   ```json
   {
     "family": "officialstest-app",
     "containerDefinitions": [
       {
         "name": "app",
         "image": "your-account-id.dkr.ecr.us-east-1.amazonaws.com/officialstest-app:latest",
         "memory": 512,
         "cpu": 256,
         "essential": true,
         "portMappings": [
           {
             "containerPort": 3000,
             "protocol": "tcp"
           }
         ],
         "environment": [
           {
             "name": "NODE_ENV",
             "value": "production"
           }
         ],
         "secrets": [
           {
             "name": "OPENAI_API_KEY",
             "valueFrom": "arn:aws:secretsmanager:region:account:secret:name"
           }
         ]
       }
     ]
   }
   ```

3. **Deploy via ECS Service with Application Load Balancer**

#### Option 3: Docker with Nginx Reverse Proxy

If running multiple apps on one EC2 instance:

```nginx
# /etc/nginx/conf.d/officialstest.conf
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Environment Variables

Required environment variables:
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic/Claude API key
- `GOOGLE_API_KEY` - Google Gemini API key
- `NODE_ENV` - Set to `production`

---

## Health Checks

Add a health check endpoint for AWS ALB/ECS:

```typescript
// In your Express app
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});
```

Then configure in ECS task definition:
```json
"healthCheck": {
  "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
  "interval": 30,
  "timeout": 5,
  "retries": 3
}
```

---

## Monitoring & Logs

- **CloudWatch Logs**: Configure ECS to send logs to CloudWatch
- **Docker logs**: `docker logs -f officialstest-app`
- **Resource monitoring**: Use CloudWatch metrics for CPU/Memory

---

## Security Recommendations

1. Store API keys in AWS Secrets Manager, not in environment variables
2. Use IAM roles for EC2/ECS instead of hardcoded credentials
3. Enable HTTPS with ACM certificate on ALB
4. Restrict security group to only necessary ports
5. Keep the Docker image updated with security patches
