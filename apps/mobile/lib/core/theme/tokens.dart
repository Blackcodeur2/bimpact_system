import 'package:flutter/material.dart';

/// Design tokens BENSKIN IMPACT — reprise de `packages/ui-tokens/tokens.json` (cahier §5).
/// Toute évolution se fait d'abord dans tokens.json.
abstract final class BColors {
  static const navy900 = Color(0xFF061B45);
  static const navy800 = Color(0xFF0A2A66);
  static const navy700 = Color(0xFF0D3A85);

  static const primary50 = Color(0xFFEAF4FB);
  static const primary100 = Color(0xFFCFE5F5);
  static const primary500 = Color(0xFF0F6FB2);
  static const primary600 = Color(0xFF0C5E98);
  static const primary700 = Color(0xFF0A4C7C);
  static const primary800 = Color(0xFF083B60);

  static const growth50 = Color(0xFFEAF7EF);
  static const growth100 = Color(0xFFCDEDD8);
  static const growth400 = Color(0xFF34B360);
  static const growth500 = Color(0xFF16A34A);
  static const growth600 = Color(0xFF12873D);
  static const growth700 = Color(0xFF0F6D32);

  static const accent50 = Color(0xFFFEF6E7);
  static const accent500 = Color(0xFFF59E0B);
  static const accent700 = Color(0xFFB27104);

  static const danger50 = Color(0xFFFDECEC);
  static const danger500 = Color(0xFFDC2626);
  static const warning50 = Color(0xFFFDF3E6);
  static const warning500 = Color(0xFFD97706);
  static const warning700 = Color(0xFFA85C05);

  static const background = Color(0xFFF7F9FC);
  static const surface = Color(0xFFFFFFFF);
  static const text = Color(0xFF172033);
  static const textMuted = Color(0xFF64748B);
  static const border = Color(0xFFE2E8F0);
  static const neutral50 = Color(0xFFF7F9FC);
  static const neutral100 = Color(0xFFEEF2F7);
  static const neutral300 = Color(0xFFCBD5E1);
  static const neutral400 = Color(0xFF94A3B8);

  static const brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [navy800, primary500],
  );

  static const growthGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [growth600, growth500],
  );
}

abstract final class BSpace {
  static const x1 = 4.0;
  static const x2 = 8.0;
  static const x3 = 12.0;
  static const x4 = 16.0;
  static const x6 = 24.0;
  static const x8 = 32.0;
  static const x10 = 40.0;
  static const x12 = 48.0;
}

abstract final class BRadius {
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 20.0;
  static const pill = 999.0;
}

abstract final class BSize {
  /// Zone tactile minimale (cahier §2 : >= 44 px).
  static const touchTarget = 44.0;
  static const buttonHeight = 52.0;
}

abstract final class BShadow {
  static const card = [
    BoxShadow(color: Color(0x0F172033), blurRadius: 2, offset: Offset(0, 1)),
    BoxShadow(color: Color(0x0F172033), blurRadius: 12, offset: Offset(0, 4)),
  ];
  static const raised = [
    BoxShadow(color: Color(0x290A2A66), blurRadius: 24, offset: Offset(0, 8)),
  ];
}
