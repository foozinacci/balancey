import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { CustomerDetail } from './pages/CustomerDetail';
import { Clients } from './pages/Clients';
import { NewOrder } from './pages/NewOrder';
import { OrderDetail } from './pages/OrderDetail';
import { Inventory } from './pages/Inventory';
import { Settings } from './pages/Settings';

// Make seed function available in console for testing
import './db/seed';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/customers/:customerId" element={<CustomerDetail />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/orders/new" element={<NewOrder />} />
          <Route path="/orders/:orderId" element={<OrderDetail />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
