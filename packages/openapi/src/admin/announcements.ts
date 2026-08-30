import { axios } from '../axios';

export type AnnouncementForm = 'banner' | 'toast' | 'modal' | 'sidebar-card';
export type AnnouncementLevel = 'info' | 'maintenance' | 'critical' | 'resolved';
export type AnnouncementAudience = 'everyone' | 'spaces' | 'users';

export interface IAnnouncement {
  id: string;
  form: AnnouncementForm;
  level: AnnouncementLevel;
  title: string;
  body: string;
  linkText: string | null;
  linkUrl: string | null;
  audience: AnnouncementAudience;
  targetIds: string[];
  startsAt: string;
  endsAt: string;
  withdrawnAt: string | null;
  createdBy: string;
  createdTime: string;
  lastModifiedAt: string | null;
  status?: 'scheduled' | 'active' | 'expired' | 'withdrawn';
}

export type ICreateAnnouncement = Omit<
  IAnnouncement,
  'id' | 'withdrawnAt' | 'createdBy' | 'createdTime' | 'lastModifiedAt' | 'status'
>;

export const listAdminAnnouncements = () => axios.get<IAnnouncement[]>('/admin/announcements');

export const createAdminAnnouncement = (input: ICreateAnnouncement) =>
  axios.post<IAnnouncement>('/admin/announcements', input);

export const withdrawAdminAnnouncement = (id: string) =>
  axios.post<IAnnouncement>(`/admin/announcements/${id}/withdraw`);

export const listActiveAnnouncements = () => axios.get<IAnnouncement[]>('/announcements/active');

export const dismissAnnouncement = (id: string) =>
  axios.delete<{ ok: true }>(`/announcements/${id}/dismiss`);
