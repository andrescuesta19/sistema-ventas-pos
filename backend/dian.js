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

// =====================================================
// Cifrado de la contraseña del certificado .p12
// Se guarda cifrada en la BD (AES-256-GCM) para no
// almacenarla en texto plano. La clave se deriva de una
// semilla del entorno + el id del local.
// =====================================================
const crypto = require('crypto');

function _dianKey(idLocal) {
    const seed = process.env.DIAN_SECRET || process.env.DATABASE_URL || 'posmaster-dian-seed';
    return crypto.createHash('sha256').update(`${seed}:${idLocal}`).digest();
}

function cifrarPassword(plain, idLocal) {
    if (!plain) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', _dianKey(idLocal), iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function descifrarPassword(stored, idLocal) {
    if (!stored) return null;
    if (!stored.startsWith('enc:')) return stored; // legacy en texto plano
    const [, ivB64, tagB64, dataB64] = stored.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', _dianKey(idLocal), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
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
// Nota: node-forge no incluye un DOM XML, así que la firma se construye
// con manipulación de strings. Para producción real, la validación final
// la hace la DIAN al recibir el documento por sus servicios web.
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

    // 1. Digest del documento sin la firma (enveloped)
    const docWithoutSig = xml.replace(/<ds:Signature[\s\S]*?<\/ds:Signature>/, '');
    const md = forge.md.sha256.create();
    md.update(docWithoutSig, 'utf8');
    const digestValueB64 = forge.util.encode64(md.digest().getBytes());

    // 2. SignedInfo (canonicalización C14N simple sobre el string)
    const signedInfo = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
  <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
  <ds:Reference URI="">
    <ds:Transforms>
      <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
      <ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
    </ds:Transforms>
    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
    <ds:DigestValue>${digestValueB64}</ds:DigestValue>
  </ds:Reference>
</ds:SignedInfo>`;

    // 3. Firmar el SignedInfo
    const md2 = forge.md.sha256.create();
    md2.update(signedInfo, 'utf8');
    const signatureBytes = privateKey.sign(md2);
    const signatureValueB64 = forge.util.encode64(signatureBytes);

    // 4. Ensamblar la firma completa
    const signatureXml = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
${signedInfo}
  <ds:SignatureValue>${signatureValueB64}</ds:SignatureValue>
  <ds:KeyInfo>
    <ds:X509Data>
      <ds:X509Certificate>${forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes())}</ds:X509Certificate>
    </ds:X509Data>
  </ds:KeyInfo>
</ds:Signature>`;

    // 5. Insertar la firma antes del cierre de Invoice
    return xml.replace(/<\/Invoice>/, signatureXml + '\n</Invoice>');
}

module.exports = { generarXMLFactura, firmarXML, escXml, cifrarPassword, descifrarPassword };