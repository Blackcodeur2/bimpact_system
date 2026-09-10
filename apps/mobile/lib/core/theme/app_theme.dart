import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'tokens.dart';

ThemeData buildAppTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: BColors.primary500,
    primary: BColors.primary500,
    onPrimary: Colors.white,
    secondary: BColors.growth500,
    onSecondary: Colors.white,
    tertiary: BColors.accent500,
    error: BColors.danger500,
    surface: BColors.surface,
    onSurface: BColors.text,
  );

  final base = ThemeData(useMaterial3: true, colorScheme: scheme, scaffoldBackgroundColor: BColors.background);
  final text = GoogleFonts.interTextTheme(base.textTheme).apply(bodyColor: BColors.text, displayColor: BColors.text);

  const buttonShape = RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(BRadius.md)));
  final buttonText = text.titleSmall?.copyWith(fontWeight: FontWeight.w700, fontSize: 16);

  OutlineInputBorder border(Color color, [double width = 1]) => OutlineInputBorder(
        borderRadius: BorderRadius.circular(BRadius.md),
        borderSide: BorderSide(color: color, width: width),
      );

  return base.copyWith(
    textTheme: text,
    appBarTheme: AppBarTheme(
      backgroundColor: BColors.navy800,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: text.titleLarge?.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: BColors.primary500,
        foregroundColor: Colors.white,
        disabledBackgroundColor: BColors.primary100,
        minimumSize: const Size.fromHeight(BSize.buttonHeight),
        shape: buttonShape,
        textStyle: buttonText,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: BColors.primary600,
        minimumSize: const Size.fromHeight(BSize.buttonHeight),
        side: const BorderSide(color: BColors.primary500, width: 1.5),
        shape: buttonShape,
        textStyle: buttonText,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: BColors.primary600,
        minimumSize: const Size(BSize.touchTarget, BSize.touchTarget),
        textStyle: text.labelLarge?.copyWith(fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: BColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: BSpace.x4, vertical: BSpace.x4),
      border: border(BColors.border),
      enabledBorder: border(BColors.border),
      focusedBorder: border(BColors.primary500, 1.5),
      errorBorder: border(BColors.danger500),
      focusedErrorBorder: border(BColors.danger500, 1.5),
      labelStyle: text.bodyMedium?.copyWith(color: BColors.textMuted),
      hintStyle: text.bodyMedium?.copyWith(color: BColors.neutral400),
      errorMaxLines: 2,
    ),
    cardTheme: CardThemeData(
      color: BColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(BRadius.lg),
        side: const BorderSide(color: BColors.border),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: BColors.text,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BRadius.md)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: BColors.surface,
      indicatorColor: BColors.primary50,
      height: 68,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => text.labelMedium?.copyWith(
          fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
          color: states.contains(WidgetState.selected) ? BColors.primary600 : BColors.textMuted,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(color: states.contains(WidgetState.selected) ? BColors.primary600 : BColors.textMuted),
      ),
    ),
    dividerTheme: const DividerThemeData(color: BColors.border, thickness: 1, space: 1),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: BColors.primary500),
  );
}
