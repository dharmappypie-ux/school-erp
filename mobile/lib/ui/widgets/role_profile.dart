import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/sync/sync_service.dart';
import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import 'widgets.dart';

/// A simple profile / account tab shared by the teacher and admin shells:
/// identity, a manual sync control, and sign out.
class RoleProfileScreen extends ConsumerWidget {
  const RoleProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final sync = ref.watch(syncProvider).state;
    final name = auth.name ?? auth.role.label;

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () => ref.read(syncProvider).sync(manual: true),
      child: ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
      children: [
        const AppScreenHeader(title: 'Profile'),
        const SizedBox(height: 18),
        DarkCard(
          child: Row(
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: Colors.white.withValues(alpha: 0.18),
                child: Text(_initials(name),
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w800, fontSize: 20)),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name,
                        style: const TextStyle(
                            color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(AppRadius.pill),
                      ),
                      child: Text('${auth.role.label} account',
                          style: const TextStyle(
                              color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        const SectionLabel('Sync'),
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text('Data sync',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  ),
                  const SizedBox(width: 12),
                  PrimaryButton(
                    expand: false,
                    label: sync.phase == SyncPhase.syncing ? 'Syncing…' : 'Sync now',
                    icon: Icons.sync_rounded,
                    onPressed: sync.phase == SyncPhase.syncing
                        ? null
                        : () => ref.read(syncProvider).sync(manual: true),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                sync.phase == SyncPhase.syncing
                    ? 'Syncing…'
                    : sync.lastSyncedAt == null
                        ? 'Not synced yet'
                        : 'Up to date',
                style: const TextStyle(fontSize: 12.5, color: AppColors.muted),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        AppCard(
          onTap: () => ref.read(authProvider).signOut(),
          child: const Row(
            children: [
              Icon(Icons.logout_rounded, color: AppColors.danger, size: 20),
              SizedBox(width: 12),
              Text('Sign out',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppColors.danger)),
            ],
          ),
        ),
        const SizedBox(height: 18),
        Center(
          child: Text('Vidyalaya · ${auth.role.label} app',
              style: const TextStyle(fontSize: 12, color: AppColors.faint)),
        ),
      ],
      ),
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(' ');
    return (parts.first.isNotEmpty ? parts.first[0] : '') +
        (parts.length > 1 && parts.last.isNotEmpty ? parts.last[0] : '');
  }
}
