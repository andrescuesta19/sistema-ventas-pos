// =====================================================
// Módulo de Facturación Electrónica DIAN (v1.9.1)
// Genera el XML UBL 2.1 de la factura electrónica de venta
// y lo firma digitalmente con el certificado del facturador.
//
// REQUISITOS DEL USUARIO (trámites legales, no se pueden
// automatizar):
//   1. Estar habilitado como facturador electrónico ante la DIAN.
//   2. Tener un certificado digital de firma electrónica (.p12)
//      emitido por una entidad autorizada (GSE, Certicámara,
//      Thomas Greg & Sons, etc.).
//   3. Tener la resolución de numeración vigente.
// =====================================================
const forge = require('node-forge');
const fs = require('fs');

// Escapa caracteres XML
function escXml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Genera el XML UBL 2.1 de la factura electrónica de venta
function generarXMLFactura({ config, venta, cliente, items, consecutivo }) {
    const fecha = new Date(venta.fecha_venta || new Date());
    const fechaISO = fecha.toISOString().slice(0, 10);
    const horaISO = fecha.toISOString().slice(11, 19);

    const nitEmisor = (config.nit || '').replace(/\D/g, '');
    const nitCliente = (cliente?.documento_identidad || '222222222222').replace(/\D/g, '');
    const tipoDocCliente = cliente?.documento_identidad ? '13' : '31'; // 13=Cédula, 31=NIT

    const subtotal = Number(venta.subtotal || 0);
    const descuento = Number(venta.descuento_total || 0);
    const impuestos = Number(venta.impuestos || 0);
    const total = Number(venta.total_neto || 0);

    const lineas = items.map((it, i) => {
        const precio = Number(it.precio_unitario_cobrado || 0);
        const cant = Number(it.cantidad || 0);
        const lineaSubtotal = Number(it.subtotal || (precio * cant));
        const iva = Math.round((lineaSubtotal * 0.19) * 100) / 100;
        return `
      <cac:InvoiceLine>
        <cbc:ID>${i + 1}</cbc:ID>
        <cbc:InvoicedQuantity unitCode="94">${cant}</cbc:InvoicedQuantity>
        <cbc:LineExtensionAmount currencyID="COP">${lineaSubtotal.toFixed(2)}</cbc:LineExtensionAmount>
        <cac:TaxTotal>
          <cbc:TaxAmount currencyID="COP">${iva.toFixed(2)}</cbc:TaxAmount>
          <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="COP">${lineaSubtotal.toFixed(2)}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="COP">${iva.toFixed(2)}</cbc:TaxAmount>
            <cac:TaxCategory>
              <cbc:ID schemeAgencyID="6" schemeID="UN/ECE 5305">VAT</cbc:ID>
              <cbc:Percent>19.00</cbc:Percent>
              <cac:TaxScheme>
                <cbc:ID schemeAgencyID="6" schemeID="UN/ECE 5153">01</cbc:ID>
                <cbc:Name>IVA</cbc:Name>
              </cac:TaxScheme>
            </cac:TaxCategory>
          </cac:TaxSubtotal>
        </cac:TaxTotal>
        <cac:Item>
          <cbc:Description>${escXml(it.nombre_producto || 'Producto')}</cbc:Description>
          <cac:SellersItemIdentification>
            <cbc:ID>${escXml(it.codigo_producto || it.id_producto || '')}</cbc:ID>
          </cac:SellersItemIdentification>
        </cac:Item>
        <cac:Price>
          <cbc:PriceAmount currencyID="COP">${precio.toFixed(2)}</cbc:PriceAmount>
        </cac:Price>
      </cac:InvoiceLine>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         xmlns:xades="http://uri.etsi.org/01903/v1.3.2#">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent/>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>10</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1</cbc:ProfileID>
  <cbc:ProfileExecutionID>1</cbc:ProfileExecutionID>
  <cbc:ID>${escXml(consecutivo)}</cbc:ID>
  <cbc:UUID schemeID="2" schemeName="CUFE-SHA384">${escXml(venta.cufe || '')}</cbc:UUID>
  <cbc:IssueDate>${fechaISO}</cbc:IssueDate>
  <cbc:IssueTime>${horaISO}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listID="__1">01</cbc:InvoiceTypeCode>
  <cbc:Note>${escXml(config.nota || 'Factura electrónica de venta')}</cbc:Note>
  <cbc:DocumentCurrencyCode listID="ISO 4217 Alpha">COP</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${items.length}</cbc:LineCountNumeric>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="31" schemeName="NIT">${nitEmisor}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${escXml(config.razon_social || '')}</cbc:Name>
      </cac:PartyName>
      <cac:PhysicalLocation>
        <cac:Address>
          <cbc:CityName>${escXml(config.ciudad || '')}</cbc:CityName>
          <cbc:CountrySubentity>${escXml(config.departamento || '')}</cbc:CountrySubentity>
          <cbc:AddressLine>${escXml(config.direccion || '')}</cbc:AddressLine>
        </cac:Address>
      </cac:PhysicalLocation>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:ID schemeName="IVA">01</cbc:ID>
          <cbc:Name>IVA</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escXml(config.razon_social || '')}</cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cac:Address>
            <cbc:CityName>${escXml(config.ciudad || '')}</cbc:CityName>
            <cbc:CountrySubentity>${escXml(config.departamento || '')}</cbc:CountrySubentity>
            <cbc:AddressLine>${escXml(config.direccion || '')}</cbc:AddressLine>
          </cac:Address>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
      <cac:Contact>
        <cbc:Telephone>${escXml(config.telefono || '')}</cbc:Telephone>
        <cbc:ElectronicMail>${escXml(config.correo || '')}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${tipoDocCliente}" schemeName="${tipoDocCliente === '31' ? 'NIT' : 'Cédula'}">${nitCliente}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escXml(cliente?.nombre_razon_social || 'Consumidor Final')}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">${impuestos.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="COP">${(subtotal - descuento).toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="COP">${impuestos.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID schemeAgencyID="6" schemeID="UN/ECE 5305">VAT</cbc:ID>
        <cbc:Percent>19.00</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID schemeAgencyID="6" schemeID="UN/ECE 5153">01</cbc:ID>
          <cbc:Name>IVA</cbc:Name>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${subtotal.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">${(subtotal - descuento).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${total.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="COP">${descuento.toFixed(2)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="COP">${total.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lineas}
</Invoice>`;
}

// Firma el XML con el certificado .p12 (firma enveloped XML Signature)
function firmarXML(xml, p12Path, p12Password) {
    const p12Der = fs.readFileSync(p12Path);
    const p12Asn1 = forge.asn1.fromDer(p12Der.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, p12Password);
    const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ||
                   p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];
    const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
    if (!keyBag || !keyBag[0] || !certBag || !certBag[0]) {
        throw new Error('El certificado .p12 no contiene clave privada o certificado válidos.');
    }
    const privateKey = keyBag[0].key;
    const cert = certBag[0].cert;

    // Firma enveloped sobre el elemento Invoice
    const pki = forge.pki;
    const md = forge.md.sha256.create();
    const xmlDoc = forge.xml.createDocument(xml);
    const invoiceEl = xmlDoc.getElementsByTagName('Invoice')[0];

    const signature = forge.xml.createDocument('<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"></ds:Signature>');
    const sigEl = signature.getElementsByTagName('Signature')[0];

    const signedInfo = forge.xml.createElement('ds:SignedInfo');
    const canonMethod = forge.xml.createElement('ds:CanonicalizationMethod');
    canonMethod.setAttribute('Algorithm', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315');
    const sigMethod = forge.xml.createElement('ds:SignatureMethod');
    sigMethod.setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256');
    const ref = forge.xml.createElement('ds:Reference');
    ref.setAttribute('URI', '');
    const transforms = forge.xml.createElement('ds:Transforms');
    const t1 = forge.xml.createElement('ds:Transform');
    t1.setAttribute('Algorithm', 'http://www.w3.org/2000/09/xmldsig#enveloped-signature');
    const t2 = forge.xml.createElement('ds:Transform');
    t2.setAttribute('Algorithm', 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315');
    transforms.appendChild(t1);
    transforms.appendChild(t2);
    const digestMethod = forge.xml.createElement('ds:DigestMethod');
    digestMethod.setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmlenc#sha256');
    const digestValue = forge.xml.createElement('ds:DigestValue');
    ref.appendChild(transforms);
    ref.appendChild(digestMethod);
    ref.appendChild(digestValue);
    signedInfo.appendChild(canonMethod);
    signedInfo.appendChild(sigMethod);
    signedInfo.appendChild(ref);

    const sigValue = forge.xml.createElement('ds:SignatureValue');
    const keyInfo = forge.xml.createElement('ds:KeyInfo');
    const x509Data = forge.xml.createElement('ds:X509Data');
    const x509Cert = forge.xml.createElement('ds:X509Certificate');
    x509Cert.textContent = forge.util.encode64(cert.getDer().getBytes());
    x509Data.appendChild(x509Cert);
    keyInfo.appendChild(x509Data);

    sigEl.appendChild(signedInfo);
    sigEl.appendChild(sigValue);
    sigEl.appendChild(keyInfo);

    // Calcular digest sobre el documento sin la firma
    const docWithoutSig = xml.replace(/<ds:Signature[\s\S]*?<\/ds:Signature>/, '');
    md.update(docWithoutSig, 'utf8');
    digestValue.textContent = forge.util.encode64(md.digest().getBytes());

    // Firmar el SignedInfo
    const md2 = forge.md.sha256.create();
    md2.update(signedInfo.toString(), 'utf8');
    const signatureBytes = privateKey.sign(md2);
    sigValue.textContent = forge.util.encode64(signatureBytes);

    // Insertar la firma al final del Invoice
    const invoiceStr = invoiceEl.toString();
    const signedXml = xml.replace(invoiceStr, invoiceStr.replace(/<\/Invoice>/, sigEl.toString() + '</Invoice>'));
    return signedXml;
}

module.exports = { generarXMLFactura, firmarXML, escXml };