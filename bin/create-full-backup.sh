#!/bin/bash

if [[ -n "$1" ]]; then
  supabase_dir="$1"
else
  supabase_dir="."
fi

if [[ ! -d "$supabase_dir/volumes" || ! -f "$supabase_dir/run.sh" ]]; then
  echo "Please run this script from the Supabase directory containing the run.sh script, or provide a path to it as the first argument"
  exit 1
fi

cd "$supabase_dir"

cyan='\033[0;36m'
nc='\033[0m' # no color
backup_name="backup_$(date "+%Y-%m-%d_%H-%M-%S")"

echo -e "${cyan}Backing up .env, volumes/db/data, volumes/storage and volumes/snippets to $backup_name...${nc}\n" &&
sudo rsync --archive --xattrs .env volumes/db/data volumes/storage volumes/snippets ./$backup_name/ &&

echo -e "${cyan}Stopping containers...${nc}\n" &&
sh run.sh stop db storage imgproxy &&

echo -e "\n${cyan}Syncing the changes from the last few seconds for completeness...${nc}\n"
sudo rsync --checksum --delete --archive --xattrs volumes/db/data volumes/storage ./$backup_name/ &&
sudo chown -R $USER:$USER $backup_name &&

echo -e "${cyan}Restarting Supabase containers...${nc}\n" &&
sh run.sh start db storage imgproxy &&

echo -e "\n${cyan}Creating encrypted archive...${nc}" &&
tar -czf "$backup_name.tar.gz" $backup_name &&
rm -rf $backup_name &&
mkdir -p $HOME/backups &&
gpg --symmetric --cipher-algo AES256 -o "$HOME/backups/$backup_name.tar.gz.gpg" "./$backup_name.tar.gz" &&
rm -f $backup_name.tar.gz &&

echo -e "\n${cyan}Done! Backup saved as $HOME/backups/$backup_name.tar.gz.gpg${nc}"

# Offer to delete the oldest backup (saves disk; backups grow over time)
oldest_backup=$(ls -1 "$HOME/backups"/backup_*.tar.gz.gpg 2>/dev/null | sort | head -n 1)
if [[ -n "$oldest_backup" && "$oldest_backup" != "$HOME/backups/$backup_name.tar.gz.gpg" ]]; then
  echo -e "\nOldest backup: ${cyan}$oldest_backup${nc}"
  read -p "Delete the oldest backup to free up disk space? [y/N] " confirm
  if [[ "$confirm" =~ ^[Yy]$ ]]; then
    rm -v "$oldest_backup"
    echo -e "${cyan}Oldest backup deleted.${nc}"
  else
    echo "Keeping it."
  fi
fi
