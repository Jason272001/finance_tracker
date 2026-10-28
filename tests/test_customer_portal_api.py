from fastapi.testclient import TestClient
import unittest
import test_business_operations as test_ops
from backend.business_operations import OperationsError

class CustomerApiCases(test_ops.OperationsFixture,unittest.TestCase):
    client=test_ops.OperationsApiTests.client
    def prepare_portal(self):
        self.owner('customers_config',enabled=True,portal_enabled=True)
        table=self.owner('snapshot')['customers']['tables'][0]['id'];person=self.owner('customer_record',collection=table,name='Customer',email='customer@example.test',data={})['id'];return self.owner('customer_invite',id=person)['invite']
    def test_customer_cookie_is_scoped_and_cannot_authorize_staff_or_owner_tools(self):
        invite=self.prepare_portal()
        with self.client() as client:
            self.assertEqual(client.post('/customer-portal/1/activate',json={'invite':invite,'password':'1234'}).status_code,400)
            self.assertEqual(client.post('/customer-portal/1/activate',json={'invite':invite,'password':'Customer test 123!'}).status_code,200)
            result=client.post('/customer-portal/1/login',json={'email':'customer@example.test','password':'Customer test 123!'})
            self.assertEqual(result.status_code,200);self.assertNotIn('token',result.json())
            cookie=result.headers['set-cookie'];self.assertIn('HttpOnly',cookie);self.assertIn('Secure',cookie);self.assertIn('SameSite=strict',cookie);self.assertIn('Path=/customer-portal/1',cookie)
            self.assertEqual(client.get('/customer-portal/1/me').json()['name'],'Customer')
            self.assertEqual(client.get('/businesses/1/operations/admin?user_id=10').status_code,403)
            self.assertEqual(client.post('/customer-portal/1/logout',json={}).status_code,200)
            self.assertEqual(client.get('/customer-portal/1/me').status_code,401)
    def test_customer_routes_fail_closed_when_disabled_and_reject_foreign_origins(self):
        with self.client() as client:
            self.assertEqual(client.get('/customer-portal/1/info').status_code,404)
            self.assertEqual(client.post('/customer-portal/1/login',json={'email':'a@example.test','password':'Sample password'},headers={'Origin':'https://untrusted.example'}).status_code,403)
