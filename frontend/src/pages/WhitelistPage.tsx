/** Whitelist management page. */

import { useState, useEffect } from 'react'
import { apiClient, WhitelistCustomerResponse, WhitelistMatchResponse } from '../lib/api'

export default function WhitelistPage() {
  const [customers, setCustomers] = useState<WhitelistCustomerResponse[]>([])
  const [matches, setMatches] = useState<WhitelistMatchResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'customers' | 'matches'>('customers')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    dob: '',
    country: '',
    entity_type: 'PERSON' as 'PERSON' | 'ORGANIZATION',
  })

  useEffect(() => {
    if (activeTab === 'customers') {
      loadCustomers()
    } else {
      loadMatches()
    }
  }, [activeTab])

  const loadCustomers = async () => {
    try {
      setLoading(true)
      const data = await apiClient.listWhitelistCustomers()
      setCustomers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customers')
    } finally {
      setLoading(false)
    }
  }

  const loadMatches = async () => {
    try {
      setLoading(true)
      const data = await apiClient.getWhitelistMatches()
      setMatches(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matches')
    } finally {
      setLoading(false)
    }
  }

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiClient.addWhitelistCustomer({
        name: newCustomer.name,
        dob: newCustomer.dob || undefined,
        country: newCustomer.country || undefined,
        entity_type: newCustomer.entity_type,
      })
      setShowAddForm(false)
      setNewCustomer({ name: '', dob: '', country: '', entity_type: 'PERSON' })
      await loadCustomers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add customer')
    }
  }

  const handleDeleteCustomer = async (customerId: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return

    try {
      await apiClient.deleteWhitelistCustomer(customerId)
      await loadCustomers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete customer')
    }
  }

  const getResolutionBadgeClass = (status: string | null | undefined): string => {
    if (status === 'PENDING') return 'badge badge-warning'
    if (status?.includes('FALSE_POSITIVE')) return 'badge badge-success'
    return 'badge badge-danger'
  }

  return (
    <div>
      <h1>Whitelist Management</h1>

      <div className="tabs">
        <button
          onClick={() => setActiveTab('customers')}
          className={`tab-btn ${activeTab === 'customers' ? 'tab-btn-active' : ''}`}
        >
          Customers ({customers.length})
        </button>
        <button
          onClick={() => setActiveTab('matches')}
          className={`tab-btn ${activeTab === 'matches' ? 'tab-btn-active' : ''}`}
        >
          Matches ({matches.filter((m) => m.resolution_status === 'PENDING').length} pending)
        </button>
      </div>

      {error && <div className="alert alert-error">Error: {error}</div>}

      {activeTab === 'customers' && (
        <div>
          <div className="flex-between mb-md">
            <h2>Whitelist Customers</h2>
            <button onClick={() => setShowAddForm(!showAddForm)} className="btn btn-success">
              Add Customer
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddCustomer} className="card card-muted mb-lg">
              <h3>Add New Customer</h3>
              <div className="form-group">
                <label htmlFor="customer-name" className="form-label">
                  Name *
                </label>
                <input
                  id="customer-name"
                  type="text"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  required
                  className="form-input"
                />
              </div>
              <div className="form-group form-grid">
                <div>
                  <label htmlFor="customer-dob" className="form-label">
                    Date of Birth
                  </label>
                  <input
                    id="customer-dob"
                    type="date"
                    value={newCustomer.dob}
                    onChange={(e) => setNewCustomer({ ...newCustomer, dob: e.target.value })}
                    className="form-input"
                  />
                </div>
                <div>
                  <label htmlFor="customer-country" className="form-label">
                    Country Code
                  </label>
                  <input
                    id="customer-country"
                    type="text"
                    value={newCustomer.country}
                    onChange={(e) => setNewCustomer({ ...newCustomer, country: e.target.value })}
                    maxLength={2}
                    className="form-input"
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="customer-type" className="form-label">
                  Entity Type
                </label>
                <select
                  id="customer-type"
                  value={newCustomer.entity_type}
                  onChange={(e) =>
                    setNewCustomer({
                      ...newCustomer,
                      entity_type: e.target.value as 'PERSON' | 'ORGANIZATION',
                    })
                  }
                  className="form-select"
                >
                  <option value="PERSON">Person</option>
                  <option value="ORGANIZATION">Organization</option>
                </select>
              </div>
              <div>
                <button type="submit" className="btn btn-success mr-sm">
                  Add
                </button>
                <button type="button" onClick={() => setShowAddForm(false)} className="btn btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <p>Loading...</p>
          ) : customers.length === 0 ? (
            <p>No whitelist customers. Add one to get started.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>DOB</th>
                  <th>Country</th>
                  <th>Created</th>
                  <th className="table-cell-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.entity_id}>
                    <td>{customer.primary_name}</td>
                    <td>{customer.entity_type}</td>
                    <td>{customer.dob && customer.dob.length > 0 ? customer.dob.join(', ') : '-'}</td>
                    <td>
                      {customer.countries && customer.countries.length > 0
                        ? customer.countries.join(', ')
                        : '-'}
                    </td>
                    <td>{new Date(customer.created_at).toLocaleDateString()}</td>
                    <td className="table-cell-right">
                      <button
                        onClick={() => handleDeleteCustomer(customer.entity_id)}
                        className="btn btn-danger btn-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'matches' && (
        <div>
          <h2>Whitelist-Blacklist Matches</h2>
          {loading ? (
            <p>Loading...</p>
          ) : matches.length === 0 ? (
            <p>No matches found.</p>
          ) : (
            <div className="card-grid">
              {matches.map((match) => (
                <div
                  key={match.match_id}
                  className={`card ${match.resolution_status === 'PENDING' ? 'card-warning' : 'card-muted'}`}
                >
                  <div className="card-header">
                    <div>
                      <strong>Match Score:</strong> {(match.match_score * 100).toFixed(2)}%
                    </div>
                    <span className={getResolutionBadgeClass(match.resolution_status)}>
                      {match.resolution_status ?? 'UNKNOWN'}
                    </span>
                  </div>
                  <div className="text-sm text-muted">
                    <div>Type: {match.match_type}</div>
                    <div>Detected: {new Date(match.detected_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
