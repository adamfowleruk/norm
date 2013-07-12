xquery version "1.0-ml";
declare namespace n = 'http://marklogic.com/norm/main';

xdmp:document-insert("/admin/config/norm-test.xml",<n:denormalisation>
 <n:name>ODBC Shred</n:name>
 <n:description>Shred document for ODBC view</n:description>
 <n:uri-pattern>/prog-avail/##s1:uri##-##auto##-odbc.xml</n:uri-pattern>
 <n:collections>norm-generated,odbc-data</n:collections>
 <n:enabled>true</n:enabled>
 <n:template>
  <n:element name="order">
   <n:attribute name="id" source="s1" source-path="/order/@id/fn:data()" />
   
   <n:element name="deliveryaddress" source="s1" source-path="/order/deliveryaddress/text()" />
   <n:element name="orderitem" source="s1" source-path="/order/orderitem/*"/>
   
   <n:static>
     <madeby>Generated by Adams awesome shredding script</madeby>
   </n:static>
  </n:element>
 </n:template>
 
 <n:sources>
  <n:source id="s1" name="order" root-xpath="fn:collection(""odbc"")" mode="create-update" required="true" shred="/order/orderitem">
   <n:collection-match>odbc</n:collection-match>
   <n:primary-key><n:element>order</n:element><n:attribute>id</n:attribute></n:primary-key>
  </n:source>
 </n:sources>
</n:denormalisation>,
xdmp:default-permissions(),"norm-config"
)

(: NB Shred must ONLY be a path to an element, with at least 1 leading / character :)