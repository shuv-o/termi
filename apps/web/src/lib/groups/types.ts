/** A server group as `/api/groups` lists it. */
export interface Group {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    icon: string | null;
    sortOrder: number;
    createdAt: string;
    _count: { servers: number };
}
