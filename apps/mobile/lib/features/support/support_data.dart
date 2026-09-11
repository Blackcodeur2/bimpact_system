// Support : FAQ, demandes et échanges avec l'équipe (cahier §7.25).

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/data/cached_fetch.dart';
import '../../core/data/json.dart';
import '../../core/data/loaded.dart';
import '../../core/network/api_client.dart';
import '../../core/providers.dart';
import '../../core/sync/sync_queue.dart';

const supportCategories = {
  'ACCOUNT': 'Compte et connexion',
  'PAYMENT': 'Rechargement ou paiement',
  'CONTRIBUTION': 'Contribution',
  'DRAW': 'Tirages',
  'TRAINING': 'Formation',
  'PROJECT': 'Projet ou entreprise',
  'ACCIDENT': 'Accident ou solidarité',
  'OTHER': 'Autre question',
};

String supportStatusLabel(String status) => switch (status) {
      'OPEN' => 'En attente de l’équipe',
      'PENDING' => 'Réponse reçue',
      'RESOLVED' => 'Résolue',
      'CLOSED' => 'Clôturée',
      _ => status,
    };

class FaqItem {
  const FaqItem({required this.question, required this.answer});
  final String question;
  final String answer;

  factory FaqItem.fromJson(Map<String, dynamic> json) => FaqItem(question: json['question'] as String, answer: json['answer'] as String);
}

class SupportMessage {
  const SupportMessage({required this.id, required this.authorType, required this.body, required this.createdAt});
  final String id;
  final String authorType;
  final String body;
  final DateTime createdAt;

  bool get fromMember => authorType == 'MEMBER';

  factory SupportMessage.fromJson(Map<String, dynamic> json) => SupportMessage(
        id: json['id'] as String,
        authorType: json['authorType'] as String,
        body: json['body'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class SupportTicket {
  const SupportTicket({
    required this.id,
    required this.reference,
    required this.category,
    required this.subject,
    required this.status,
    required this.lastMessageAt,
    required this.createdAt,
    this.canReply = false,
    this.messages = const [],
  });

  final String id;
  final String reference;
  final String category;
  final String subject;
  final String status;
  final DateTime lastMessageAt;
  final DateTime createdAt;
  final bool canReply;
  final List<SupportMessage> messages;

  String get categoryLabel => supportCategories[category] ?? category;

  factory SupportTicket.fromJson(Map<String, dynamic> json) => SupportTicket(
        id: json['id'] as String,
        reference: json['reference'] as String,
        category: json['category'] as String,
        subject: json['subject'] as String,
        status: json['status'] as String,
        lastMessageAt: DateTime.parse(json['lastMessageAt'] as String),
        createdAt: DateTime.parse(json['createdAt'] as String),
        canReply: json['canReply'] as bool? ?? false,
        messages: listOf(json['messages'], SupportMessage.fromJson),
      );
}

class SupportRepository {
  SupportRepository({required this.client, required this.cache});
  final ApiClient client;
  final dynamic cache;

  Future<Loaded<List<FaqItem>>> faq() => fetchWithCache(
        client: client,
        cache: cache,
        key: 'support.faq',
        request: (dio) => dio.get('/support/faq'),
        parse: (json) => listOf((json as Map<String, dynamic>)['items'], FaqItem.fromJson),
      );

  Future<List<SupportTicket>> tickets() => client.call(
        (dio) => dio.get('/support/tickets', queryParameters: {'limit': 50}),
        (json) => PageResult.fromJson(json, SupportTicket.fromJson).items,
      );

  Future<SupportTicket> ticket(String id) =>
      client.call((dio) => dio.get('/support/tickets/$id'), (json) => SupportTicket.fromJson(json as Map<String, dynamic>));

  Future<SupportTicket> close(String id) =>
      client.call((dio) => dio.post('/support/tickets/$id/close'), (json) => SupportTicket.fromJson(json as Map<String, dynamic>));
}

final supportRepositoryProvider = Provider<SupportRepository>(
  (ref) => SupportRepository(client: ref.watch(apiClientProvider), cache: ref.watch(localCacheProvider)),
);

final faqProvider = FutureProvider.autoDispose<Loaded<List<FaqItem>>>((ref) => ref.watch(supportRepositoryProvider).faq());

final ticketsProvider = FutureProvider.autoDispose<List<SupportTicket>>((ref) {
  ref.watch(syncRevisionProvider('support'));
  return ref.watch(supportRepositoryProvider).tickets();
});

final ticketProvider = FutureProvider.autoDispose.family<SupportTicket, String>((ref, id) {
  ref.watch(syncRevisionProvider('support'));
  return ref.watch(supportRepositoryProvider).ticket(id);
});
