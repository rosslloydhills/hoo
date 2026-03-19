'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase/browserClient';

type TaskRow = {
  id: string;
  contact_id: string | null;
  description: string | null;
  due_date: string | null;
  completed: boolean | null;
};

type BubbleTask = {
  id: string;
  description: string;
  contactName: string;
  dueDateText: string;
};

function startOfDayTimestamp(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isDueTodayOrEarlier(dueDate: string | null) {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;

  const today = new Date();
  return startOfDayTimestamp(due) <= startOfDayTimestamp(today);
}

export function ReminderBubbles() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [tasks, setTasks] = useState<BubbleTask[]>([]);

  useEffect(() => {
    let mounted = true;

    async function loadOverdue() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId || !mounted) return;

      const { data, error } = await supabase
        .from('tasks')
        .select('id,contact_id,description,due_date,completed')
        .eq('user_id', userId)
        .eq('completed', false)
        .order('due_date', { ascending: true });

      if (error || !mounted) return;

      const rows = ((data ?? []) as TaskRow[]).filter((row) => isDueTodayOrEarlier(row.due_date));
      const contactIds = [...new Set(rows.map((r) => r.contact_id).filter((v): v is string => Boolean(v)))];

      const contactNameById = new Map<string, string>();
      if (contactIds.length > 0) {
        const { data: contactsData } = await supabase
          .from('contacts')
          .select('id,name')
          .in('id', contactIds);
        for (const c of contactsData ?? []) {
          contactNameById.set(c.id, c.name ?? 'Unknown contact');
        }
      }

      const mapped: BubbleTask[] = rows.map((r) => {
        const fallbackFromDescription =
          typeof r.description === 'string' && r.description.includes(':')
            ? r.description.split(':')[0].trim()
            : 'Unknown contact';
        const dueDate = r.due_date ? new Date(r.due_date) : null;
        const dueDateText =
          dueDate && !Number.isNaN(dueDate.getTime())
            ? dueDate.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })
            : 'Unknown date';
        return {
          id: r.id,
          description: r.description ?? 'Follow up reminder',
          contactName: (r.contact_id && contactNameById.get(r.contact_id)) || fallbackFromDescription,
          dueDateText
        };
      });

      setTasks(mapped);
    }

    loadOverdue();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  async function dismiss(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    await supabase.from('tasks').update({ completed: true }).eq('id', taskId);
  }

  async function snoozeOneDay(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    const nextDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('tasks')
      .update({
        due_date: nextDay,
        completed: false
      })
      .eq('id', taskId);
  }

  if (tasks.length === 0) return null;

  return (
    <div className="hoo-reminderStack">
      {tasks.map((task) => (
        <div key={task.id} className="hoo-reminderBubble">
          <div className="hoo-reminderTitle">Reminder</div>
          <div className="hoo-reminderContact">{task.contactName}</div>
          <div className="hoo-reminderDue">Due {task.dueDateText}</div>
          <div className="hoo-reminderText">{task.description}</div>
          <div className="hoo-reminderActions">
            <button
              className="hoo-reminderSnooze"
              onClick={() => {
                snoozeOneDay(task.id);
              }}
            >
              Snooze 1 day
            </button>
            <button
              className="hoo-reminderDismiss"
              onClick={() => {
                dismiss(task.id);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

