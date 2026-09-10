# @benskin/ui-tokens

Source de vérité du design system BENSKIN IMPACT (cahier §5).

- `tokens.json` : couleurs, typographie, rayons, espacements, tailles tactiles, format monétaire XAF.
- `assets/logo-mark.svg` : marque recréée d'après la planche de design (provisoire, à remplacer par le fichier source officiel).

Consommateurs :
- Flutter : `apps/mobile/lib/core/theme/tokens.dart` reprend ces valeurs.
- Angular : `apps/admin` les expose en variables CSS.

Toute modification de couleur ou d'espacement se fait d'abord ici.
