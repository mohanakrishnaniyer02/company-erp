import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5205/api'
})

// attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('company_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// if the token is rejected, bounce back to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('company_token')
      localStorage.removeItem('company_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
