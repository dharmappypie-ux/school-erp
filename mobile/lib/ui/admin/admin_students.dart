import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../state/providers.dart';
import '../../theme/app_theme.dart';
import '../widgets/widgets.dart';
import 'create_student.dart';
import 'student_detail.dart';
import 'widgets/admin_widgets.dart';

const _statusFilters = ['ACTIVE', 'ALL', 'ALUMNI', 'TRANSFERRED', 'DROPPED', 'SUSPENDED', 'ON_LEAVE'];

class AdminStudentsScreen extends ConsumerStatefulWidget {
  const AdminStudentsScreen({super.key});
  @override
  ConsumerState<AdminStudentsScreen> createState() => _AdminStudentsScreenState();
}

class _AdminStudentsScreenState extends ConsumerState<AdminStudentsScreen> {
  final _search = TextEditingController();
  String _q = '';
  String _status = 'ACTIVE';
  int _page = 1;
  bool _loading = false;
  bool _hasMore = false;
  int _total = 0;
  final List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    setState(() { _loading = true; _page = 1; _items.clear(); });
    await _fetch();
  }

  Future<void> _fetch() async {
    final res = await ref.read(apiProvider).getJson('/api/mobile/v1/admin/students', query: {
      if (_q.isNotEmpty) 'q': _q,
      'status': _status,
      'page': '$_page',
    });
    if (!mounted) return;
    setState(() {
      _loading = false;
      _total = (res?['total'] as num?)?.toInt() ?? _items.length;
      _hasMore = res?['hasMore'] == true;
      _items.addAll((res?['students'] as List?)?.cast<Map<String, dynamic>>() ?? const []);
    });
  }

  Future<void> _loadMore() async {
    setState(() { _page++; });
    await _fetch();
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _reload,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 28),
        children: [
          AppScreenHeader(
            eyebrowText: 'Admin',
            title: 'Students',
            trailing: AddButton(onTap: () async {
              await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CreateStudentScreen()));
              _reload();
            }),
          ),
          const SizedBox(height: 16),
          // Search
          TextField(
            controller: _search,
            textInputAction: TextInputAction.search,
            onSubmitted: (v) { _q = v.trim(); _reload(); },
            decoration: InputDecoration(
              hintText: 'Search name, admission no, email, phone',
              prefixIcon: const Icon(Icons.search_rounded, size: 20),
              suffixIcon: _q.isNotEmpty
                  ? IconButton(icon: const Icon(Icons.close_rounded, size: 18),
                      onPressed: () { _search.clear(); _q = ''; _reload(); })
                  : null,
              isDense: true,
              filled: true,
              fillColor: AppColors.surface,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
            ),
          ),
          const SizedBox(height: 12),
          // Status filter
          SizedBox(
            height: 34,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (final s in _statusFilters)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: GestureDetector(
                      onTap: () { if (_status != s) { _status = s; _reload(); } },
                      child: Container(
                        alignment: Alignment.center,
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        decoration: BoxDecoration(
                          color: _status == s ? AppColors.primary : AppColors.surface,
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                        ),
                        child: Text(s == 'ALL' ? 'All' : s[0] + s.substring(1).toLowerCase().replaceAll('_', ' '),
                            style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700,
                                color: _status == s ? Colors.white : AppColors.muted)),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          if (_loading && _items.isEmpty)
            const SizedBox(height: 160, child: Center(child: CircularProgressIndicator()))
          else if (_items.isEmpty)
            const AppCard(child: Text('No students match.', style: TextStyle(color: AppColors.muted)))
          else ...[
            Text('${_items.length} of $_total', style: eyebrow(AppColors.muted)),
            const SizedBox(height: 10),
            for (final s in _items) _studentRow(s),
            if (_hasMore) ...[
              const SizedBox(height: 4),
              OutlinedButton(
                onPressed: _loading ? null : _loadMore,
                child: Text(_loading ? 'Loading…' : 'Load more'),
              ),
            ],
          ],
        ],
      ),
    );
  }

  Widget _studentRow(Map<String, dynamic> s) {
    final status = s['status']?.toString() ?? 'ACTIVE';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppCard(
        onTap: () async {
          await Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => StudentDetailScreen(studentId: s['id'] as String)));
          _reload();
        },
        child: Row(children: [
          Container(
            width: 44, height: 44, alignment: Alignment.center,
            decoration: BoxDecoration(color: AppColors.accentSoft, borderRadius: BorderRadius.circular(13)),
            child: Text(_initials((s['name'] as String?) ?? ''),
                style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800)),
          ),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text((s['name'] as String?) ?? '', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text('${s['className']} · ${s['admissionNo']}', style: const TextStyle(fontSize: 12.5, color: AppColors.muted)),
          ])),
          if (status != 'ACTIVE')
            StatusChip(label: status.toLowerCase().replaceAll('_', ' '), color: AppColors.muted, bg: AppColors.line)
          else
            const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
        ]),
      ),
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(' ');
    return (parts.first.isNotEmpty ? parts.first[0] : '') +
        (parts.length > 1 && parts.last.isNotEmpty ? parts.last[0] : '');
  }

  @override
  void dispose() { _search.dispose(); super.dispose(); }
}
