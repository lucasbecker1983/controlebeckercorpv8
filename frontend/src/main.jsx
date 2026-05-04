import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-950">
          <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h1 className="text-lg font-black">Portal indisponível no navegador</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Reabra a página do portal ou tente pelo navegador padrão do dispositivo.
            </p>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
)
