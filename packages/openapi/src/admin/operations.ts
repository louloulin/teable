import { axios } from '../axios';

export interface IAdminUser {
  id: string;
  name: string | null;
  email: string;
  isAdmin: boolean;
  deactivatedTime: string | null;
  createdTime: string;
  lastSignTime: string | null;
}

export interface IAdminSpace {
  id: string;
  name: string;
  createdBy: string;
  createdTime: string;
}

export interface IAdminQuotaHit {
  id: string;
  spaceId: string | null;
  metric: string;
  attempted: number;
  cap: number;
  actorId: string | null;
  resource: string | null;
  createdTime: string;
}

export interface IAdminPagedResult<T> {
  list: T[];
  total: number;
  skip: number;
  take: number;
}

export const listAdminUsers = async (params?: { skip?: number; take?: number; search?: string }) =>
  axios.get<IAdminPagedResult<IAdminUser>>('/admin/users', { params });

export const listAdminSpaces = async (params?: { skip?: number; take?: number }) =>
  axios.get<IAdminPagedResult<IAdminSpace>>('/admin/spaces', { params });

export const listAdminQuotaHits = async (params?: { skip?: number; take?: number }) =>
  axios.get<IAdminPagedResult<IAdminQuotaHit>>('/admin/quota-dashboard', { params });
