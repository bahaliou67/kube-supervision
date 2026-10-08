# Sécurité

## Signaler une faille

**N'ouvrez pas d'issue publique.** Utilisez le signalement privé de GitHub :
onglet **Security** du dépôt → **Report a vulnerability**
(<https://github.com/bahaliou67/kube-supervision/security/advisories/new>).

Indiquez la version concernée, les étapes pour reproduire et l'impact possible.
Vous recevrez une réponse sous 7 jours. Une fois le correctif publié, la faille
est décrite dans un avis de sécurité, avec votre nom si vous le souhaitez.

## Versions suivies

Seule la dernière version publiée reçoit des correctifs de sécurité.

## Vérifier un exécutable téléchargé

Chaque exécutable publié dans les Releases est accompagné d'une attestation de
provenance signée par GitHub : elle prouve qu'il a été construit par le
workflow `release.yml` de ce dépôt, à partir du commit du tag. Avec la
[CLI GitHub](https://cli.github.com) :

```bash
gh attestation verify kube-supervision-win-x64.exe --repo bahaliou67/kube-supervision
```

Sans la CLI, comparez l'empreinte SHA-256 du fichier avec `SHA256SUMS.txt`,
publié dans la même Release.
