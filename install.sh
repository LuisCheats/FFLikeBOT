#!/bin/bash

echo "==========================================="
echo "   DVWILKER API - INSTALADOR AUTOMÁTICO      "
echo "==========================================="

read -p "Ingresa el dominio para tu API (ej: api.tudominio.com): " DOMAIN

if [ -z "$DOMAIN" ]; then
    echo "Error: El dominio es obligatorio."
    exit 1
fi

sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw nginx python3-certbot-nginx

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

sudo npm install -g pm2

npm install
npx playwright install --with-deps chromium

sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
echo "y" | sudo ufw enable

cat <<EOF | sudo tee /etc/nginx/sites-available/dvwilker-api
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://localhost:3032;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/dvwilker-api /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos --m frasesbebor@gmail.com

pm2 start index.js --name "dvwilker-api"
pm2 save
pm2 startup

echo "==========================================="
echo "🚀 INSTALACIÓN COMPLETADA CON ÉXITO"
echo "🔗 Tu API está lista en: https://$DOMAIN"
echo "🛡️  SSL configurado y Firewall activo."
echo "==========================================="