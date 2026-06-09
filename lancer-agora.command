#!/bin/bash
# Double-cliquez sur ce fichier pour lancer AGORA
cd "$(dirname "$0")"
echo "🚀 Lancement du serveur AGORA sur http://localhost:8080"
echo "📌 Ctrl+C pour arrêter le serveur"
open "http://localhost:8080/operating-system.html"
python3 -m http.server 8080
