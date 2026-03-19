'use client';

type PlaceholderTabProps = {
  title: string;
  description: string;
};

export function PlaceholderTab({ title, description }: PlaceholderTabProps) {
  return (
    <div className="hoo-tabPage">
      <div className="hoo-sectionTitle">{title}</div>
      <div className="hoo-card hoo-placeholderCard">{description}</div>
    </div>
  );
}

