import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/form_widgets.dart';
import '../widgets/widgets.dart';

/// Biometric and RFID attendance devices.
///
/// A device's API key is shown exactly once, when it is issued: the server
/// stores only a hash, so a key can be replaced but never read back.
class AdminDevicesScreen extends ConsumerStatefulWidget {
  const AdminDevicesScreen({super.key});
  @override
  ConsumerState<AdminDevicesScreen> createState() => _AdminDevicesScreenState();
}

class _AdminDevicesScreenState extends ConsumerState<AdminDevicesScreen> {
  bool _busy = false;
  String? _issuedKey;

  Future<void> _post(Map<String, dynamic> body, {bool keyed = false}) async {
    setState(() => _busy = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/devices', body);
    if (!mounted) return;
    setState(() => _busy = false);
    final msg = (res.body?['message'] ?? res.body?['error'] ?? 'Could not do that.').toString();
    if (res.ok && keyed && res.body?['apiKey'] != null) {
      setState(() => _issuedKey = '${res.body!['apiKey']}');
    }
    showToast(context, msg, error: !res.ok);
    if (res.ok) ref.invalidate(adminDevicesProvider);
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(adminDevicesProvider);
    final data = async.value;
    final devices = (data?['devices'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final recent = (data?['recent'] as List?)?.cast<Map<String, dynamic>>() ?? const [];
    final types = (data?['deviceTypes'] as List?)?.map((e) => e.toString()).toList() ??
        const ['FINGERPRINT', 'RFID', 'FACE', 'IRIS'];
    final unmatched = (data?['unmatched'] as num?)?.toInt() ?? 0;

    return DetailScaffold(
      title: 'Attendance devices',
      subtitle: 'Fingerprint, RFID, face',
      icon: Icons.fingerprint_rounded,
      onRefresh: () async => ref.invalidate(adminDevicesProvider),
      fab: FloatingActionButton.extended(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        onPressed: () => Navigator.of(context)
            .push(MaterialPageRoute(builder: (_) => _RegisterDevice(types: types)))
            .then((_) => ref.invalidate(adminDevicesProvider)),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Register'),
      ),
      children: [
        if (_issuedKey != null) ...[
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(children: [
                  Icon(Icons.vpn_key_rounded, color: AppColors.good, size: 20),
                  SizedBox(width: 10),
                  Text('New API key — shown once',
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                ]),
                const SizedBox(height: 10),
                SelectableText(_issuedKey!,
                    style: const TextStyle(fontFamily: 'monospace', fontSize: 13.5)),
                const SizedBox(height: 8),
                const Text('Save it on the device now.',
                    style: TextStyle(fontSize: 12, color: AppColors.muted)),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
        if (async.isLoading && data == null)
          const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
        else if (data == null)
          const AppCard(
            child: Row(children: [
              Icon(Icons.cloud_off_rounded, color: AppColors.warn),
              SizedBox(width: 12),
              Expanded(
                child: Text("Couldn't load the devices — pull down to retry.",
                    style: TextStyle(color: AppColors.muted)),
              ),
            ]),
          )
        else ...[
          Row(children: [
            Expanded(
              child: StatTile(
                icon: Icons.sensors_rounded,
                value: '${devices.length}',
                label: '${devices.where((d) => d['isActive'] == true).length} active',
                color: AppColors.primary,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: StatTile(
                icon: Icons.help_outline_rounded,
                value: '$unmatched',
                label: 'Unmatched punches',
                color: unmatched > 0 ? AppColors.warn : AppColors.good,
              ),
            ),
          ]),
          if (unmatched > 0) ...[
            const SizedBox(height: 12),
            PrimaryButton(
              label: _busy ? 'Processing…' : 'Match them now',
              icon: Icons.sync_rounded,
              onPressed: _busy ? null : () => _post({'action': 'process'}),
            ),
          ],
          const SizedBox(height: 20),
          SectionLabel('Devices · ${devices.length}'),
          if (devices.isEmpty)
            const AppCard(
              child: Text('No devices registered. Tap “Register” to add the first one.',
                  style: TextStyle(color: AppColors.muted)),
            )
          else
            for (final d in devices) ...[
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(d['name']?.toString() ?? '',
                                style:
                                    const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                            const SizedBox(height: 2),
                            Text(
                              '${d['deviceType']} · ${d['serialNumber']}'
                              '${d['location'] != null ? " · ${d['location']}" : ""}',
                              style: const TextStyle(fontSize: 12, color: AppColors.muted),
                            ),
                          ],
                        ),
                      ),
                      StatusChip(
                        label: d['isActive'] == true ? 'Active' : 'Off',
                        color: d['isActive'] == true ? AppColors.good : AppColors.danger,
                        bg: d['isActive'] == true ? AppColors.goodSoft : AppColors.dangerSoft,
                      ),
                    ]),
                    const SizedBox(height: 8),
                    Text(
                      d['lastSeenAt'] == null
                          ? 'Never heard from · ${d['punches']} punches'
                          : 'Last seen ${(d['lastSeenAt'] as String).split('T').first} · ${d['punches']} punches',
                      style: const TextStyle(fontSize: 12, color: AppColors.faint),
                    ),
                    const SizedBox(height: 12),
                    const Hairline(),
                    const SizedBox(height: 10),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      _Act(
                        label: 'New API key',
                        onTap: _busy
                            ? null
                            : () => _post({'action': 'regenerate', 'deviceId': d['id']},
                                keyed: true),
                      ),
                      _Act(
                        label: d['isActive'] == true ? 'Deactivate' : 'Activate',
                        danger: d['isActive'] == true,
                        onTap: _busy
                            ? null
                            : () => _post({
                                  'action': 'status',
                                  'deviceId': d['id'],
                                  'isActive': d['isActive'] != true,
                                }),
                      ),
                    ]),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
          if (recent.isNotEmpty) ...[
            const SizedBox(height: 8),
            const SectionLabel('Recent punches'),
            AppCard(
              child: Column(children: [
                for (var i = 0; i < recent.length; i++) ...[
                  if (i > 0) const Hairline(),
                  RowTile(
                    title: recent[i]['person']?.toString() ?? 'Unmatched',
                    subtitle: '${recent[i]['device']} · ${recent[i]['direction']}'
                        '${recent[i]['person'] == null ? " · ${recent[i]['externalRef']}" : ""}',
                    icon: recent[i]['direction'] == 'IN'
                        ? Icons.login_rounded
                        : Icons.logout_rounded,
                    iconColor: recent[i]['person'] == null ? AppColors.warn : AppColors.good,
                    iconBg:
                        recent[i]['person'] == null ? AppColors.warnSoft : AppColors.goodSoft,
                    trailing: Text(
                      ((recent[i]['at'] as String?) ?? '').contains('T')
                          ? (recent[i]['at'] as String).split('T')[1].substring(0, 5)
                          : '',
                      style: const TextStyle(fontSize: 12, color: AppColors.muted),
                    ),
                  ),
                ],
              ]),
            ),
          ],
        ],
      ],
    );
  }
}

class _Act extends StatelessWidget {
  const _Act({required this.label, required this.onTap, this.danger = false});
  final String label;
  final VoidCallback? onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
          decoration: BoxDecoration(
            color: danger ? AppColors.dangerSoft : AppColors.accentSoft,
            borderRadius: BorderRadius.circular(AppRadius.pill),
          ),
          child: Text(label,
              style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: danger ? AppColors.danger : AppColors.primary)),
        ),
      );
}

class _RegisterDevice extends ConsumerStatefulWidget {
  const _RegisterDevice({required this.types});
  final List<String> types;
  @override
  ConsumerState<_RegisterDevice> createState() => _RegisterDeviceState();
}

class _RegisterDeviceState extends ConsumerState<_RegisterDevice> {
  final _name = TextEditingController();
  final _serial = TextEditingController();
  final _location = TextEditingController();
  final _ip = TextEditingController();
  late String _type = widget.types.first;
  bool _saving = false;
  String? _key;

  Future<void> _save() async {
    if (_name.text.trim().length < 2 || _serial.text.trim().length < 2) {
      showToast(context, 'Enter a name and a serial number.', error: true);
      return;
    }
    setState(() => _saving = true);
    final res = await ref.read(apiProvider).postJson('/api/mobile/v1/admin/devices', {
      'action': 'register',
      'name': _name.text.trim(),
      'serialNumber': _serial.text.trim(),
      'deviceType': _type,
      'location': _location.text.trim(),
      'ipAddress': _ip.text.trim(),
    });
    if (!mounted) return;
    setState(() => _saving = false);
    if (res.ok && res.body?['apiKey'] != null) {
      ref.invalidate(adminDevicesProvider);
      setState(() => _key = res.body!['apiKey'].toString());
    } else {
      showToast(context, (res.body?['error'] ?? 'Could not register it.').toString(),
          error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_key != null) {
      return DetailScaffold(
        title: 'Device registered',
        subtitle: 'Save the key on the device now',
        icon: Icons.check_circle_rounded,
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('API key', style: TextStyle(fontWeight: FontWeight.w800)),
                const SizedBox(height: 10),
                SelectableText(_key!,
                    style: const TextStyle(fontFamily: 'monospace', fontSize: 14)),
              ],
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'This is the only time the key is shown — the server keeps only its hash. '
            'If it is lost, issue a new one.',
            style: TextStyle(fontSize: 12.5, color: AppColors.muted, height: 1.5),
          ),
          const SizedBox(height: 22),
          PrimaryButton(
            label: 'Done',
            icon: Icons.check_rounded,
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ],
      );
    }

    return DetailScaffold(
      title: 'Register a device',
      subtitle: 'Fingerprint, RFID, face or iris',
      icon: Icons.fingerprint_rounded,
      children: [
        const SectionLabel('Device'),
        AppTextField(controller: _name, label: 'Name (e.g. Main gate)', required: true),
        const SizedBox(height: 12),
        AppTextField(controller: _serial, label: 'Serial number', required: true),
        const SizedBox(height: 12),
        AppDropdown<String>(
          label: 'Type',
          value: _type,
          items: widget.types,
          itemLabel: (t) => t[0] + t.substring(1).toLowerCase(),
          onChanged: (v) => setState(() => _type = v ?? widget.types.first),
        ),
        const SizedBox(height: 12),
        AppTextField(controller: _location, label: 'Location'),
        const SizedBox(height: 12),
        AppTextField(controller: _ip, label: 'IP address'),
        const SizedBox(height: 22),
        PrimaryButton(
          label: _saving ? 'Registering…' : 'Register device',
          icon: Icons.check_rounded,
          onPressed: _saving ? null : _save,
        ),
      ],
    );
  }

  @override
  void dispose() {
    _name.dispose();
    _serial.dispose();
    _location.dispose();
    _ip.dispose();
    super.dispose();
  }
}
