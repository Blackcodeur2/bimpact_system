import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../theme/tokens.dart';

/// Marque BENSKIN IMPACT (logo recréé d'après la planche, provisoire).
class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 48});
  final double size;

  @override
  Widget build(BuildContext context) {
    return SvgPicture.asset('assets/brand/logo_mark.svg', width: size, height: size, semanticsLabel: 'BENSKIN IMPACT');
  }
}

class BrandLockup extends StatelessWidget {
  const BrandLockup({super.key, this.markSize = 56, this.onDark = true, this.vertical = true});

  final double markSize;
  final bool onDark;
  final bool vertical;

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context).textTheme.headlineSmall!.copyWith(
          fontWeight: FontWeight.w800,
          height: 1.0,
          letterSpacing: 0.5,
          fontSize: markSize * 0.46,
        );
    final words = Column(
      crossAxisAlignment: vertical ? CrossAxisAlignment.center : CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('BENSKIN', style: base.copyWith(color: onDark ? Colors.white : BColors.navy800)),
        Text('IMPACT', style: base.copyWith(color: BColors.growth500)),
      ],
    );
    final mark = BrandMark(size: markSize);
    return vertical
        ? Column(mainAxisSize: MainAxisSize.min, children: [mark, const SizedBox(height: BSpace.x3), words])
        : Row(mainAxisSize: MainAxisSize.min, children: [mark, const SizedBox(width: BSpace.x3), words]);
  }
}

class Tagline extends StatelessWidget {
  const Tagline({super.key, this.onDark = true, this.textAlign = TextAlign.center});
  final bool onDark;
  final TextAlign textAlign;

  @override
  Widget build(BuildContext context) {
    final style = Theme.of(context).textTheme.titleMedium!.copyWith(fontWeight: FontWeight.w700, height: 1.3);
    return Text.rich(
      TextSpan(children: [
        TextSpan(text: '200 FCFA aujourd’hui.\n', style: style.copyWith(color: BColors.accent500)),
        TextSpan(text: 'Une opportunité demain.', style: style.copyWith(color: onDark ? Colors.white : BColors.navy800)),
      ]),
      textAlign: textAlign,
    );
  }
}
