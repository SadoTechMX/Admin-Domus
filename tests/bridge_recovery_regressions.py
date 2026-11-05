"""Pure memory / temporary files / mocked CUPS. Never opens a printer or drawer."""
import importlib.util
import io
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch, Mock

spec = importlib.util.spec_from_file_location('domus_bridge', pathlib.Path(__file__).resolve().parents[1] / 'services/print-bridge/server.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

class BridgeRecovery(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = pathlib.Path(self.tmp.name)
        self.stack = []
        for name, value in {'DOMUS_DIR':root,'TOKEN_FILE':root/'token','HISTORY_FILE':root/'prints.json','DRAWER_HISTORY_FILE':root/'drawer.json','CONFIG_FILE':root/'config.json'}.items():
            p=patch.object(bridge,name,value);p.start();self.stack.append(p)
        self.token=bridge.ensure_token()
        bridge.save_config({'drawer_configured':True,'drawer_channel':0})

    def tearDown(self):
        for p in reversed(self.stack):p.stop()
        self.tmp.cleanup()

    def request(self,path,data=None,token=True,origin='https://sadotechmx.github.io'):
        handler=object.__new__(bridge.DomusPrintHandler)
        body=json.dumps(data or {}).encode()
        handler.path=path;handler.headers={'Content-Length':str(len(body)),'Origin':origin}
        if token:handler.headers['X-Domus-Print-Token']=self.token
        handler.rfile=io.BytesIO(body);out=[]
        handler.send_json=lambda status,value:out.append((int(status),value))
        handler._do_POST_locked()
        return out[-1]

    def test_text_cannot_inject_drawer_pulse(self):
        raw=bridge.build_receipt_escpos({'printId':'p','receipt':'r','customer':'QA\x1bp\x00\x19\xfa','items':[{'name':'QA\x1bp\x00\x19\xfa','price':40,'qty':1}],'total':40,'method':'Terminal 1'})
        self.assertNotIn(bridge.DRAWER_PULSE_CH0,raw)
        self.assertNotIn(bridge.DRAWER_PULSE_CH1,raw)

    def test_transfer_warning(self):
        raw=bridge.build_receipt_escpos({'receipt':'r','total':40,'method':'Transferencia','paymentStatus':'PENDIENTE_VERIFICACION'})
        self.assertIn(b'PENDIENTE',raw)

    def test_origin_rejected_before_cups(self):
        with patch.object(bridge.subprocess,'run') as run:
            status,_=self.request('/print',{'printId':'p'},origin='https://untrusted.invalid')
            self.assertEqual(status,403);run.assert_not_called()

    def test_query_token_is_not_authentication(self):
        with patch.object(bridge.subprocess,'run') as run:
            status,_=self.request('/print?token='+self.token,{'printId':'p'},token=False)
            self.assertEqual(status,401);run.assert_not_called()

    def test_same_print_id_queues_once(self):
        with patch.object(bridge.subprocess,'run',return_value=Mock(returncode=0,stdout=b'job 1',stderr=b'')) as run:
            first=self.request('/print',{'printId':'p','receipt':'r','total':40})
            second=self.request('/print',{'printId':'p','receipt':'r','total':40})
            self.assertEqual(first[0],200);self.assertTrue(first[1]['queued'])
            self.assertTrue(second[1]['alreadyPrinted']);self.assertEqual(run.call_count,1)

    def test_timeout_does_not_requeue_uncertain_print(self):
        with patch.object(bridge.subprocess,'run',side_effect=subprocess.TimeoutExpired('lp',5)) as run:
            self.assertEqual(self.request('/print',{'printId':'p','receipt':'r'})[0],504)
            self.assertEqual(self.request('/print',{'printId':'p','receipt':'r'})[0],409)
            self.assertEqual(run.call_count,1)

    def test_drawer_rejects_every_non_cash_method(self):
        with patch.object(bridge.subprocess,'run') as run:
            for method in ['Terminal 1','Terminal 2','Transferencia','Crédito','Cortesía']:
                status,_=self.request('/drawer/open',{'requestId':method,'operator':'QA','receipt':'r','paid':True,'method':method,'reason':'CASH_PAYMENT'})
                self.assertEqual(status,409)
            run.assert_not_called()

    def test_drawer_cash_requires_receipt_and_confirmed_payment(self):
        with patch.object(bridge.subprocess,'run') as run:
            for extra in [{'paid':False},{'receipt':''},{'reprint':True}]:
                status,_=self.request('/drawer/open',dict({'requestId':'d','operator':'QA','receipt':'r','method':'Efectivo','paid':True,'reason':'CASH_PAYMENT'},**extra))
                self.assertEqual(status,409)
            run.assert_not_called()

    def test_manual_confirmation_and_cooldown(self):
        with patch.object(bridge.subprocess,'run',return_value=Mock(returncode=0,stdout=b'',stderr=b'')) as run:
            body={'requestId':'d','operator':'QA','reason':'MANUAL'}
            self.assertEqual(self.request('/drawer/open',body)[0],409)
            body['confirmed']=True
            self.assertEqual(self.request('/drawer/open',body)[0],200)
            self.assertTrue(self.request('/drawer/open',body)[1]['alreadyTriggered'])
            body['requestId']='d2'
            self.assertEqual(self.request('/drawer/open',body)[0],429)
            self.assertEqual(run.call_count,1)

    def test_corrupt_history_fails_closed(self):
        bridge.HISTORY_FILE.write_text('not json')
        self.assertRaises(RuntimeError,bridge.load_history)

    def test_payload_limit(self):
        with patch.object(bridge.subprocess,'run') as run:
            status,_=self.request('/print',{'printId':'p','items':[{'name':'a'*65536}]})
            self.assertEqual(status,413);run.assert_not_called()

if __name__=='__main__':unittest.main(verbosity=2)
