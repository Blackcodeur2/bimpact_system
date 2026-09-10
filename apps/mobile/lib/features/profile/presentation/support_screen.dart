import 'package:flutter/material.dart';

import '../../../core/theme/tokens.dart';

class SupportScreen extends StatelessWidget {
  const SupportScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BColors.surface,
      appBar: AppBar(
        title: const Text('Support & Urgences'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(BSpace.x4),
        children: [
          // Emergency call button
          Container(
            padding: const EdgeInsets.all(BSpace.x5),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF842029), Color(0xFFDC3545)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(BRadius.xl),
              boxShadow: [
                BoxShadow(
                  color: Colors.red.withValues(alpha: 0.3),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.phone_in_talk, color: Colors.white, size: 28),
                    SizedBox(width: BSpace.x3),
                    Expanded(
                      child: Text(
                        'Numéro d’Urgence Permanence',
                        style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: BSpace.x2),
                const Text(
                  'Ligne ouverte 24h/24 en cas d’accident grave ou d’agression sur la voie publique.',
                  style: TextStyle(color: Colors.white70, fontSize: 13),
                ),
                const SizedBox(height: BSpace.x4),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.red.shade800,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BRadius.md)),
                    ),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Appel d’urgence : +237 699 00 00 00')),
                      );
                    },
                    icon: const Icon(Icons.call, color: Colors.red),
                    label: const Text('+237 699 00 00 00', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: BSpace.x6),
          const Text('Canaux d’assistance', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: BSpace.x3),

          _buildChannelCard(
            context,
            icon: Icons.chat,
            color: const Color(0xFF25D366),
            title: 'WhatsApp Permanence Syndicat',
            subtitle: 'Réponse en moins de 15 minutes',
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Ouverture WhatsApp : +237 670 00 00 00')),
              );
            },
          ),
          const SizedBox(height: BSpace.x3),

          _buildChannelCard(
            context,
            icon: Icons.location_on,
            color: BColors.brandBlue,
            title: 'Points relais & Bureaux locaux',
            subtitle: 'Yaoundé (Mokolo, Nlongkak) & Douala (Akwa)',
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Permanences ouvertes du lundi au samedi de 8h à 18h.')),
              );
            },
          ),

          const SizedBox(height: BSpace.x6),
          const Text('Foire Aux Questions (FAQ)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: BSpace.x3),

          _buildFaqItem(
            'Comment fonctionne la cotisation de 200 FCFA ?',
            'Elle est prélevée chaque matin sur votre solde disponible si l’auto-débit est activé, ou payable manuellement. 200 FCFA par jour garantissent votre éligibilité aux tirages et votre couverture en cas d’accident.',
          ),
          _buildFaqItem(
            'Quand ont lieu les tirages au sort ?',
            'Les tirages ont lieu chaque fin de mois. La liste des conducteurs à jour est gelée publiquement et le tirage utilise un algorithme cryptographique SHA-256 entièrement vérifiable par tous.',
          ),
          _buildFaqItem(
            'Que faire immédiatement en cas d’accident ?',
            'Allez dans l’onglet « Solidarité », appuyez sur « Déclarer un sinistre » et indiquez l’hôpital. Rendez-vous aux urgences, conservez tous vos reçus et ordonnances pour prise en charge.',
          ),
        ],
      ),
    );
  }

  Widget _buildChannelCard(
    BuildContext context, {
    required IconData icon,
    required Color color,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(BRadius.lg),
        border: Border.all(color: BColors.border),
      ),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: color.withValues(alpha: 0.12),
          child: Icon(icon, color: color),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
        subtitle: Text(subtitle, style: const TextStyle(fontSize: 12, color: Colors.grey)),
        trailing: const Icon(Icons.arrow_forward_ios, size: 14, color: Colors.grey),
        onTap: onTap,
      ),
    );
  }

  Widget _buildFaqItem(String question, String answer) {
    return Container(
      margin: const EdgeInsets.only(bottom: BSpace.x3),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(BRadius.lg),
        border: Border.all(color: BColors.border),
      ),
      child: ExpansionTile(
        title: Text(question, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 16, right: 16, bottom: 16),
            child: Text(answer, style: const TextStyle(fontSize: 13, height: 1.4, color: BColors.textSecondary)),
          ),
        ],
      ),
    );
  }
}
