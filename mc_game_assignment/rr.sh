
git pull origin main

sudo docker compose -v down --remove-orphans
sudo docker compose up --build -d

sudo docker compose logs -f nodeapp
