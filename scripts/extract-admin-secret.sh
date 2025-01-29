#!/bin/bash

# Export environment variable
export PGPASSWORD=$POSTGRES_PASSWORD

# Wait until applications table exists and is accessible
until psql -h postgres -U postgres -d logto -c "SELECT 1 FROM applications LIMIT 1" >/dev/null 2>&1; do
  echo "Waiting for applications table to be ready..."
  sleep 1
done

# Extract both tenant secrets in a single SQL query and store in a temporary file
psql -h postgres -U postgres -d logto -t -A -c "
  select case 
    when id = 'm-admin' then 'ADMIN_TENANT_SECRET='
    when id = 'm-default' then 'DEFAULT_TENANT_SECRET='
  end || secret 
  from applications 
  where id in ('m-admin', 'm-default')
  order by id;
" > /tmp/new_secrets

# Update only the secret lines in .env file
while IFS= read -r line; do
  key=$(echo "$line" | cut -d'=' -f1)
  sed -i "s|^$key=.*|$line|" /app/.env
done < /tmp/new_secrets

# Clean up
rm /tmp/new_secrets
