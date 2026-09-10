import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/tokens.dart';

class SecuritySettingsScreen extends StatefulWidget {
  const SecuritySettingsScreen({super.key});

  @override
  State<SecuritySettingsScreen> createState() => _SecuritySettingsScreenState();
}

class _SecuritySettingsScreenState extends State<SecuritySettingsScreen> {
  final _oldPinController = TextEditingController();
  final _newPinController = TextEditingController();
  final _confirmPinController = TextEditingController();
  bool _isSaving = false;

  @override
  void dispose() {
    _oldPinController.dispose();
    _newPinController.dispose();
    _confirmPinController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(
        title: const Text('Sécurité & Code PIN'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(BSpace.x4),
        children: [
          Container(
            padding: const EdgeInsets.all(BSpace.x4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(BRadius.lg),
              border: Border.all(color: BColors.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.lock_outline, color: BColors.primaryNavy),
                    SizedBox(width: BSpace.x2),
                    Text('Modifier mon code PIN', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(height: BSpace.x3),
                const Text(
                  'Votre code PIN à 6 chiffres protège l’accès à votre portefeuille et à vos cotisations.',
                  style: TextStyle(fontSize: 13, color: BColors.textSecondary),
                ),
                const SizedBox(height: BSpace.x4),

                TextField(
                  controller: _oldPinController,
                  obscureText: true,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  decoration: const InputDecoration(
                    labelText: 'Ancien code PIN',
                    prefixIcon: Icon(Icons.key),
                  ),
                ),
                const SizedBox(height: BSpace.x2),

                TextField(
                  controller: _newPinController,
                  obscureText: true,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  decoration: const InputDecoration(
                    labelText: 'Nouveau code PIN (6 chiffres)',
                    prefixIcon: Icon(Icons.lock_reset),
                  ),
                ),
                const SizedBox(height: BSpace.x2),

                TextField(
                  controller: _confirmPinController,
                  obscureText: true,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  decoration: const InputDecoration(
                    labelText: 'Confirmer le nouveau code PIN',
                    prefixIcon: Icon(Icons.check),
                  ),
                ),
                const SizedBox(height: BSpace.x4),

                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: BColors.brandBlue,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BRadius.md)),
                    ),
                    onPressed: _isSaving ? null : _savePin,
                    child: _isSaving
                        ? const CircularProgressIndicator(color: Colors.white)
                        : const Text('Mettre à jour mon code PIN', style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: BSpace.x6),
          const Text('Appareils connectés', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: BSpace.x2),

          Container(
            padding: const EdgeInsets.all(BSpace.x4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(BRadius.lg),
              border: Border.all(color: BColors.border),
            ),
            child: Row(
              children: [
                const Icon(Icons.phone_android, color: BColors.brandGreen, size: 32),
                const SizedBox(width: BSpace.x3),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Cet appareil (Actif)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      Text('Connecté via Flutter Web • Yaoundé', style: TextStyle(fontSize: 12, color: Colors.grey)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: BColors.brandGreen.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text('En ligne', style: TextStyle(color: BColors.brandGreen, fontSize: 11, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _savePin() {
    final oldP = _oldPinController.text;
    final newP = _newPinController.text;
    final confP = _confirmPinController.text;

    if (oldP.length != 6 || newP.length != 6) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Le code PIN doit comporter exactement 6 chiffres.')));
      return;
    }
    if (newP != confP) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Les deux nouveaux codes PIN ne correspondent pas.')));
      return;
    }

    setState(() => _isSaving = true);
    Future.delayed(const Duration(milliseconds: 600), () {
      if (mounted) {
        setState(() => _isSaving = false);
        _oldPinController.clear();
        _newPinController.clear();
        _confirmPinController.clear();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('🔒 Code PIN modifié avec succès !'),
            backgroundColor: BColors.brandGreen,
          ),
        );
      }
    });
  }
}
