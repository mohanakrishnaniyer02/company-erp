import { useEffect, useState } from 'react'
import api from '../api/client'

// Single source for every Department dropdown in the app: the master list
// (Departments → "Departments" tab). Returns names sorted A-Z.
export default function useDepartmentNames() {
  const [names, setNames] = useState([])
  useEffect(() => {
    api.get('/org-departments')
      .then(r => setNames(r.data.map(d => d.departmentName).sort((a, b) => a.localeCompare(b))))
      .catch(() => {})
  }, [])
  return names
}
