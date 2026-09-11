import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

class PickedDocument {
  const PickedDocument(this.bytes, this.filename);
  final Uint8List bytes;
  final String filename;
}

/// Photo d'un justificatif (appareil photo ou galerie), réduite avant envoi pour limiter la consommation de données.
Future<PickedDocument?> pickDocumentPhoto(BuildContext context) async {
  final source = await showModalBottomSheet<ImageSource>(
    context: context,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(
          leading: const Icon(Icons.photo_camera_outlined),
          title: const Text('Prendre une photo'),
          onTap: () => Navigator.pop(ctx, ImageSource.camera),
        ),
        ListTile(
          leading: const Icon(Icons.photo_library_outlined),
          title: const Text('Choisir dans la galerie'),
          onTap: () => Navigator.pop(ctx, ImageSource.gallery),
        ),
      ]),
    ),
  );
  if (source == null) return null;
  try {
    final file = await ImagePicker().pickImage(source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 80);
    if (file == null) return null;
    return PickedDocument(await file.readAsBytes(), file.name.isEmpty ? 'justificatif.jpg' : file.name);
  } catch (_) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible d’ouvrir l’appareil photo ou la galerie. Vérifiez les autorisations.')),
      );
    }
    return null;
  }
}
