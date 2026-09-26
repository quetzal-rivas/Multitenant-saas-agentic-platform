import { NextRequest, NextResponse } from 'next/server';
import { SkillManager } from '@/Backend/skill-manager';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source');
    const category = searchParams.get('category');
    const search = searchParams.get('search')?.toLowerCase();

    let skills = SkillManager.getAllSkills();

    if (source === 'library') {
      skills = skills.filter((s) => s.isInLibrary);
    } else if (source && source !== 'all') {
      skills = skills.filter((s) => s.source === source);
    }

    if (category && category !== 'all') {
      skills = skills.filter((s) => s.category === category);
    }

    if (search) {
      skills = skills.filter(
        (s) =>
          s.name.toLowerCase().includes(search) ||
          s.description.toLowerCase().includes(search) ||
          s.tags.some((t) => t.toLowerCase().includes(search)) ||
          s.author?.name.toLowerCase().includes(search)
      );
    }

    const stats = SkillManager.getStats();

    return NextResponse.json({
      skills,
      stats,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to list skills' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, data, manifest } = body;

    switch (action) {
      case 'add-to-library': {
        if (!id) return NextResponse.json({ error: 'Missing skill id' }, { status: 400 });
        const updated = SkillManager.addSkillToLibrary(id);
        if (!updated) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
        return NextResponse.json({ success: true, skill: updated, stats: SkillManager.getStats() });
      }

      case 'remove-from-library': {
        if (!id) return NextResponse.json({ error: 'Missing skill id' }, { status: 400 });
        const updated = SkillManager.removeSkillFromLibrary(id);
        if (!updated) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
        return NextResponse.json({ success: true, skill: updated, stats: SkillManager.getStats() });
      }

      case 'toggle-enable': {
        if (!id) return NextResponse.json({ error: 'Missing skill id' }, { status: 400 });
        const updated = SkillManager.toggleSkillEnabled(id);
        if (!updated) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
        return NextResponse.json({ success: true, skill: updated });
      }

      case 'upload': {
        if (!manifest || typeof manifest !== 'string') {
          return NextResponse.json({ error: 'Missing skill manifest string' }, { status: 400 });
        }
        const created = SkillManager.importSkillFromManifest(manifest);
        return NextResponse.json({ success: true, skill: created, stats: SkillManager.getStats() }, { status: 201 });
      }

      case 'create': {
        if (!data || !data.name || !data.systemPromptAddendum) {
          return NextResponse.json(
            { error: 'Skill must have a name and system prompt instructions' },
            { status: 400 }
          );
        }
        const created = SkillManager.createCustomSkill(data);
        return NextResponse.json({ success: true, skill: created, stats: SkillManager.getStats() }, { status: 201 });
      }

      case 'delete': {
        if (!id) return NextResponse.json({ error: 'Missing skill id' }, { status: 400 });
        const deleted = SkillManager.deleteCustomSkill(id);
        if (!deleted) {
          return NextResponse.json(
            { error: 'Cannot delete built-in platform/community skill or not found' },
            { status: 400 }
          );
        }
        return NextResponse.json({ success: true, stats: SkillManager.getStats() });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to process skill action' }, { status: 500 });
  }
}
