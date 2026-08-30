import { createAxios } from '@teable/openapi';

export const getAxios = () => {
  const axios = createAxios();
  const backendUrl =
    process.env.BACKEND_API_URL ??
    `http://localhost:${process.env.BACKEND_PORT ?? process.env.PORT}`;
  axios.defaults.baseURL = `${backendUrl.replace(/\/$/, '')}/api`;
  return axios;
};

export const axios = getAxios();
