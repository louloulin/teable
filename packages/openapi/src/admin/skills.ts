import { axios } from '../axios';

export interface IAdminInstanceSkill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  source: 'github' | 'upload';
  sourceUrl?: string;
  createdTime: string;
  lastModifiedTime: string;
}

export interface IAdminInstanceSkillDetail extends IAdminInstanceSkill {
  content: string;
}

export const listAdminInstanceSkills = async () =>
  axios.get<IAdminInstanceSkill[]>('/admin/skills');

export const getAdminInstanceSkill = async (id: string) =>
  axios.get<IAdminInstanceSkillDetail>(`/admin/skills/${id}`);

export const importAdminInstanceSkillFile = async (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return axios.post<IAdminInstanceSkillDetail>('/admin/skills/import', form);
};

export const importAdminInstanceSkillGithub = async (sourceUrl: string) =>
  axios.post<IAdminInstanceSkillDetail>('/admin/skills/import', { sourceUrl });

export const updateAdminInstanceSkill = async (
  id: string,
  input: Partial<Pick<IAdminInstanceSkillDetail, 'name' | 'description' | 'content' | 'enabled'>>
) => axios.patch<IAdminInstanceSkillDetail>(`/admin/skills/${id}`, input);

export const refreshAdminInstanceSkill = async (id: string) =>
  axios.post<IAdminInstanceSkillDetail>(`/admin/skills/${id}/refresh`);

export const deleteAdminInstanceSkill = async (id: string) =>
  axios.delete<{ id: string; deleted: true }>(`/admin/skills/${id}`);

export const downloadAdminInstanceSkill = (id: string) => `/api/admin/skills/${id}/download`;
